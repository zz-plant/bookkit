import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type FrontmatterValue = string | string[] | number | boolean | null;

export type Frontmatter = {
	data: Record<string, FrontmatterValue>;
	hasFrontmatter: boolean;
};

export function listContentFiles(dir: string): string[] {
	if (!existsSync(dir)) return [];
	const entries = readdirSync(dir, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...listContentFiles(fullPath));
		} else if (entry.isFile() && isContentFile(fullPath)) {
			files.push(fullPath);
		}
	}
	return files;
}

export function isContentFile(path: string): boolean {
	return path.endsWith(".md") || path.endsWith(".mdx");
}

import { parseFrontmatter as parseSharedFrontmatter } from "../../packages/astro-bookkit/src/utils/frontmatter";

/**
 * The engine's frontmatter parser (utils/frontmatter.ts) in the shape the
 * scripts use: a file whose YAML does not parse reads as having none.
 */
export function parseFrontmatter(
	content: string,
): Frontmatter & { body: string } {
	const parsed = parseSharedFrontmatter(content);
	if (parsed.status !== "ok") {
		return { data: {}, hasFrontmatter: false, body: content };
	}
	return {
		data: parsed.data as Record<string, FrontmatterValue>,
		hasFrontmatter: true,
		body: parsed.body,
	};
}

export function toStringValue(value: FrontmatterValue): string {
	if (typeof value === "string") return value.trim();
	return "";
}

export function arrayValue(value: FrontmatterValue): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter((item): item is string => typeof item === "string")
		.map((item) => item.trim());
}

function coerceValue(value: string): FrontmatterValue {
	const cleaned = value.replace(/^"|"$/g, "").replace(/^'|'$/g, "");
	if (cleaned === "true") return true;
	if (cleaned === "false") return false;
	if (cleaned !== "" && !Number.isNaN(Number(cleaned))) return Number(cleaned);
	return cleaned;
}
