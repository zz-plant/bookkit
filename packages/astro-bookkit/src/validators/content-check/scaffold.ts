/**
 * What is built from the contract's fields: a new content file
 * (scaffoldSource), and the contract as an agent reads it (contentContract),
 * whose template is a scaffold filled with the example values.
 */

import { z } from "zod";
import {
	type ContentSection,
	type ContractField,
	FIELDS,
	SCHEMAS,
	SECTION_DIRECTORIES,
} from "./contract";

export type ContentContract = {
	section: ContentSection;
	/** Folder under `src/content/book/`. */
	directory: string;
	fields: readonly ContractField[];
	/** JSON Schema of the frontmatter, generated from the Zod schema the build uses. */
	jsonSchema: Record<string, unknown>;
	/** A file that compiles with no findings, using the illustrative example values. */
	template: string;
};

type ScaffoldValue = string | number | boolean | readonly string[];

// Slugs and keywords such as `draft` read better bare; everything else is quoted.
const yamlScalar = (value: string | number | boolean): string =>
	typeof value !== "string"
		? String(value)
		: /^[a-z][a-z0-9-]*$/.test(value) &&
				!["true", "false", "null", "yes", "no", "on", "off"].includes(value)
			? value
			: JSON.stringify(value);

export const yamlValue = (value: ScaffoldValue): string => {
	if (!Array.isArray(value))
		return ` ${yamlScalar(value as string | number | boolean)}`;
	if (value.length === 0) return " []";
	return `\n${value.map((item) => `  - ${JSON.stringify(item)}`).join("\n")}`;
};

/**
 * A new content file for a section, built from its contract: the given values
 * in contract order, and every required or expected field the caller left out
 * as an empty placeholder carrying what to write as a YAML comment. Empty
 * placeholders are warnings, never errors, so the file builds while it is
 * being filled in. `note` becomes an MDX comment under the frontmatter.
 */
export const scaffoldSource = (
	section: ContentSection,
	values: Record<string, ScaffoldValue | undefined>,
	note?: string,
): string => {
	const fields = FIELDS[section];
	const lines: string[] = [];
	for (const field of fields) {
		const value = values[field.name];
		if (value !== undefined) {
			lines.push(`${field.name}:${yamlValue(value)}`);
		} else if (field.whenMissing !== "optional") {
			const empty =
				field.kind === "list" ? " []" : field.kind === "number" ? "" : ' ""';
			lines.push(`${field.name}:${empty} # ${field.meaning}`);
		}
	}
	for (const [name, value] of Object.entries(values)) {
		if (value !== undefined && !fields.some((field) => field.name === name)) {
			lines.push(`${name}:${yamlValue(value)}`);
		}
	}
	const comment = note ? `\n{/* ${note.replace(/\*\//g, "* /")} */}\n` : "";
	return `---\n${lines.join("\n")}\n---\n${comment}`;
};

export const templateFor = (section: ContentSection): string =>
	scaffoldSource(
		section,
		{
			...Object.fromEntries(
				FIELDS[section]
					.filter((field) => field.whenMissing !== "optional")
					.map((field) => [field.name, field.example]),
			),
			status: "draft",
		},
		`Prose for this ${section} goes here.`,
	);

export const contentContract = (section: ContentSection): ContentContract => ({
	section,
	directory: SECTION_DIRECTORIES[section],
	fields: FIELDS[section],
	jsonSchema: z.toJSONSchema(SCHEMAS[section], {
		io: "input",
		unrepresentable: "any",
	}) as Record<string, unknown>,
	template: templateFor(section),
});
