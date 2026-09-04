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

import yaml from "js-yaml";

export function parseFrontmatter(
	content: string,
): Frontmatter & { body: string } {
	if (!content.startsWith("---")) {
		return { data: {}, hasFrontmatter: false, body: content };
	}
	const end = content.indexOf("\n---", 3);
	if (end === -1) return { data: {}, hasFrontmatter: false, body: content };
	const rawYaml = content.slice(3, end).trim();
	const body = content.slice(end + 4).trim();
	try {
		const parsed = yaml.load(rawYaml);
		if (parsed && typeof parsed === "object") {
			return {
				data: parsed as Record<string, FrontmatterValue>,
				hasFrontmatter: true,
				body,
			};
		}
	} catch {
		// Fall back to empty data if malformed
	}
	return { data: {}, hasFrontmatter: false, body: content };
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
