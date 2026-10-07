import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { listBookDirs } from "./_lib";

type FrontmatterValue = string | string[] | number | boolean | null;

type ParsedFrontmatter = {
	data: Record<string, FrontmatterValue>;
	body: string;
	hasFrontmatter: boolean;
};

const books = listBookDirs();
if (books.length === 0) {
	console.log("No books found under apps/*");
	process.exit(0);
}

const updated: string[] = [];

for (const book of books) {
	const base = join(process.cwd(), "apps", book, "src", "content", "book");
	const files = listContentFiles(base);
	for (const file of files) {
		const parsed = parseFrontmatter(readFileSync(file, "utf8"));
		if (!parsed.hasFrontmatter) continue;

		const order = frontmatterOrder(file);
		if (!order) continue;

		const nextFrontmatter = stringifyFrontmatter(parsed.data, order);
		const nextContent = `${nextFrontmatter}${parsed.body}`;
		if (nextContent !== readFileSync(file, "utf8")) {
			writeFileSync(file, nextContent, "utf8");
			updated.push(file);
		}
	}
}

if (updated.length === 0) {
	console.log("No frontmatter changes needed.");
} else {
	console.log(`Updated frontmatter in ${updated.length} file(s).`);
}

function listContentFiles(dir: string): string[] {
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

function isContentFile(path: string): boolean {
	return path.endsWith(".md") || path.endsWith(".mdx");
}

function frontmatterOrder(path: string): string[] | null {
	if (path.includes(`${join("content", "book", "mechanisms")}`)) {
		return [
			"slug",
			"title",
			"definition",
			"is",
			"isNot",
			"predictions",
			"tests",
		];
	}
	if (path.includes(`${join("content", "book", "toolkit")}`)) {
		return [
			"slug",
			"mechanism",
			"name",
			"trigger",
			"timeboxMinutes",
			"steps",
			"failureLooksLike",
			"legitimateDemand",
		];
	}
	if (path.includes(`${join("content", "book", "examples")}`)) {
		return ["mechanism", "domain", "title", "status"];
	}
	return null;
}

function parseFrontmatter(content: string): ParsedFrontmatter {
	if (!content.startsWith("---")) {
		return { data: {}, body: content, hasFrontmatter: false };
	}
	const end = content.indexOf("\n---", 3);
	if (end === -1) return { data: {}, body: content, hasFrontmatter: false };
	const raw = content.slice(3, end).trim();
	const body = content.slice(end + 4);
	const lines = raw.split(/\r?\n/);
	const data: Record<string, FrontmatterValue> = {};
	let currentKey: string | null = null;

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const keyMatch = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(trimmed);
		if (keyMatch) {
			const key = keyMatch[1];
			const valueRaw = keyMatch[2];
			currentKey = key;
			if (!valueRaw) {
				data[key] = [];
			} else {
				data[key] = coerceValue(valueRaw);
				currentKey = null;
			}
			continue;
		}
		const listMatch = /^-\s*(.*)$/.exec(trimmed);
		if (listMatch && currentKey) {
			const current = data[currentKey];
			if (Array.isArray(current))
				current.push(coerceValue(listMatch[1]) as string);
		}
	}

	return { data, body, hasFrontmatter: true };
}

function stringifyFrontmatter(
	data: Record<string, FrontmatterValue>,
	order: string[],
): string {
	const keys = new Set(Object.keys(data));
	const orderedKeys = [
		...order,
		...[...keys].filter((key) => !order.includes(key)).sort(),
	];
	const lines: string[] = ["---"];

	for (const key of orderedKeys) {
		if (!(key in data)) continue;
		const value = data[key];
		if (Array.isArray(value)) {
			lines.push(`${key}:`);
			for (const item of value) {
				lines.push(`  - ${formatString(item)}`);
			}
			continue;
		}
		if (typeof value === "number" || typeof value === "boolean") {
			lines.push(`${key}: ${value}`);
			continue;
		}
		if (value === null) {
			lines.push(`${key}: null`);
			continue;
		}
		lines.push(`${key}: ${formatString(value ?? "")}`);
	}

	lines.push("---", "");
	return lines.join("\n");
}

function formatString(value: string): string {
	if (value === "") return '""';
	if (/^[a-z0-9-]+$/i.test(value)) return value;
	const escaped = value.replace(/"/g, '\\"');
	return `"${escaped}"`;
}

function coerceValue(value: string): FrontmatterValue {
	const cleaned = value.replace(/^"|"$/g, "").replace(/^'|'$/g, "");
	if (cleaned === "true") return true;
	if (cleaned === "false") return false;
	if (cleaned !== "" && !Number.isNaN(Number(cleaned))) return Number(cleaned);
	return cleaned;
}
