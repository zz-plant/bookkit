import {
	binaryTag,
	CORE_SCHEMA,
	DUMP_SCHEMA,
	dump,
	load,
	mergeTag,
	omapTag,
	pairsTag,
	Schema,
	setTag,
	timestampTag,
	YAMLException,
} from "js-yaml";

/**
 * js-yaml 4's default schema, rebuilt from js-yaml 5's tags: YAML 1.2 core
 * plus timestamps, merge keys and the other extras frontmatter has always been
 * read with. js-yaml 5's default reads `date: 2026-03-02` as a string.
 */
const FRONTMATTER_SCHEMA = new Schema([
	...CORE_SCHEMA.tags,
	timestampTag,
	mergeTag,
	binaryTag,
	omapTag,
	pairsTag,
	setTag,
]);

/**
 * The one frontmatter parser: validation, search, exports, MCP, and the
 * author scripts all read content files through it, so a field means the
 * same thing everywhere. YAML is parsed in full (lists, quoting, block
 * scalars); a file whose YAML does not parse says why instead of reading as
 * empty.
 */

export type ParsedFrontmatter =
	| { status: "ok"; data: Record<string, unknown>; body: string }
	| { status: "missing"; data: Record<string, never>; body: string }
	| {
			status: "invalid";
			data: Record<string, never>;
			body: string;
			/** The parser's reason, with the line it failed on. */
			reason: string;
	  };

// An optional BOM, an opening --- line, the YAML (possibly empty), a closing --- line.
export const FRONTMATTER =
	/^﻿?---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;

export const parseFrontmatter = (raw: string): ParsedFrontmatter => {
	const match = raw.match(FRONTMATTER);
	if (!match) return { status: "missing", data: {}, body: raw };
	const body = raw.slice(match[0].length).trim();
	try {
		const data = load(match[1] ?? "", { schema: FRONTMATTER_SCHEMA });
		if (data === undefined || data === null) {
			return { status: "ok", data: {}, body };
		}
		if (typeof data === "object" && !Array.isArray(data)) {
			return { status: "ok", data: data as Record<string, unknown>, body };
		}
		return {
			status: "invalid",
			data: {},
			body,
			reason: "it must be a mapping of field: value pairs",
		};
	} catch (error) {
		const reason =
			error instanceof YAMLException
				? `${error.reason} at line ${(error.mark?.line ?? 0) + 1}`
				: String(error);
		return { status: "invalid", data: {}, body, reason };
	}
};

/**
 * How many lines of `source` come before `body`, the body `parseFrontmatter`
 * read from it, so a line in the body can be named as a line of the file.
 */
export const linesBeforeBody = (source: string, body: string): number =>
	source.slice(0, source.trimEnd().length - body.trimEnd().length).split("\n")
		.length - 1;

/**
 * A field as text, for readers that only need scalars (titles, slugs,
 * summaries): strings are trimmed, numbers and booleans are stringified, and
 * anything else is undefined.
 */
export const frontmatterText = (
	data: Record<string, unknown>,
	field: string,
): string | undefined => {
	const value = data[field];
	if (typeof value === "string") return value.trim();
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	return undefined;
};

/** Every scalar field as text; lists and objects are left out. */
export const frontmatterTextFields = (
	data: Record<string, unknown>,
): Record<string, string> => {
	const fields: Record<string, string> = {};
	for (const key of Object.keys(data)) {
		const value = frontmatterText(data, key);
		if (value !== undefined) fields[key] = value;
	}
	return fields;
};

/**
 * A frontmatter block for `data`, written by js-yaml so any title or summary
 * (quotes, colons, `#`, leading dashes) reads back as the same string.
 * `DUMP_SCHEMA` quotes values a YAML 1.1 reader would turn into booleans or
 * numbers (`yes`, `on`, `017`), as js-yaml 4 did, so Astro's own frontmatter
 * parser reads them as strings too.
 */
export const formatFrontmatter = (data: Record<string, unknown>): string =>
	`---\n${dump(data, { lineWidth: -1, schema: DUMP_SCHEMA })}---\n`;
