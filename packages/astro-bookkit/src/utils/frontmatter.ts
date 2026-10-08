import yaml from "js-yaml";

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
const FRONTMATTER = /^﻿?---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;

export const parseFrontmatter = (raw: string): ParsedFrontmatter => {
	const match = raw.match(FRONTMATTER);
	if (!match) return { status: "missing", data: {}, body: raw };
	const body = raw.slice(match[0].length).trim();
	try {
		const data = yaml.load(match[1] ?? "");
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
			error instanceof yaml.YAMLException
				? `${error.reason} at line ${(error.mark?.line ?? 0) + 1}`
				: String(error);
		return { status: "invalid", data: {}, body, reason };
	}
};

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
