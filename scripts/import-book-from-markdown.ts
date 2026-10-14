import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { MdxConversion } from "../packages/astro-bookkit/src/utils/markdown";
import { requireArg } from "./_lib";
import { importChapter } from "./lib/import-markdown";

const book = requireArg("--book");
const sourceDir = requireArg("--dir");
const force = process.argv.includes("--force");

const workspaceRoot = join(import.meta.dir, "..");
const chaptersDir = join(
	workspaceRoot,
	"apps",
	book,
	"src",
	"content",
	"book",
	"chapters",
);

if (!existsSync(chaptersDir)) {
	console.error(
		`No chapters directory for book "${book}". Run \`bun run new:book -- --book ${book}\` first.`,
	);
	process.exit(1);
}
if (!existsSync(sourceDir)) {
	console.error(`Source directory not found: ${sourceDir}`);
	process.exit(1);
}

const slugify = (name: string): string =>
	name
		.replace(/\.(md|mdx)$/i, "")
		.toLowerCase()
		.replace(/\s+/g, "-")
		.replace(/[^a-z0-9-]/g, "")
		.replace(/^-+|-+$/g, "");

const listMarkdown = (dir: string): string[] => {
	const files: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...listMarkdown(full));
		} else if (/\.(md|mdx)$/i.test(entry.name)) {
			files.push(full);
		}
	}
	return files.sort();
};

const sourceFiles = listMarkdown(sourceDir);
if (sourceFiles.length === 0) {
	console.error(`No markdown files found under ${sourceDir}`);
	process.exit(1);
}

const written: string[] = [];
const skipped: string[] = [];
const unreadable: string[] = [];
const converted: MdxConversion = {
	htmlComments: 0,
	braces: 0,
	autolinks: 0,
	tags: 0,
};

sourceFiles.forEach((file, index) => {
	const slug = slugify(relative(sourceDir, file).replace(/\//g, "--"));
	const prefix = String(index + 1).padStart(2, "0");
	const fileName = `${prefix}-${slug}.mdx`;
	const target = join(chaptersDir, fileName);

	if (!slug) {
		skipped.push(`${file} (no usable slug)`);
		return;
	}
	if (existsSync(target) && !force) {
		skipped.push(target);
		return;
	}

	const chapter = importChapter(file, readFileSync(file, "utf8"), slug);
	writeFileSync(target, chapter.source, "utf8");
	written.push(target);
	for (const key of Object.keys(converted) as Array<keyof MdxConversion>) {
		converted[key] += chapter.changes[key];
	}
	if (chapter.unreadableFrontmatter) {
		unreadable.push(
			`${relative(sourceDir, file)} (${chapter.unreadableFrontmatter})`,
		);
	}
});

console.log(
	`Imported ${written.length} chapter(s) into apps/${book}/src/content/book/chapters/`,
);
for (const file of written) console.log(`  + ${file}`);
const conversions = [
	[converted.htmlComments, "HTML comment(s) to MDX comments"],
	[converted.autolinks, "<autolink>(s) to links"],
	[converted.braces, "brace(s) escaped"],
	[converted.tags, "tag-like <(s) escaped"],
] as const;
if (conversions.some(([count]) => count > 0)) {
	console.log(
		`Converted so every chapter compiles as MDX: ${conversions
			.filter(([count]) => count > 0)
			.map(([count, what]) => `${count} ${what}`)
			.join(", ")}.`,
	);
}
if (unreadable.length > 0) {
	console.log(
		"Frontmatter that did not parse was kept as text at the top of the chapter:",
	);
	for (const file of unreadable) console.log(`  ! ${file}`);
}
if (skipped.length > 0) {
	console.log(`Skipped ${skipped.length} file(s):`);
	for (const file of skipped) console.log(`  ~ ${file}`);
	console.log("Re-run with --force to overwrite existing chapters.");
}

console.log("\nNext steps:");
console.log(
	`  1. bun run bookkit propose --book ${book}   — draft mechanisms and tools from ideas that recur`,
);
console.log(
	`  2. bun run bookkit check ${book} --quick    — what each file still needs, with fixes`,
);
console.log(
	`  3. bun run bookkit dev ${book}              — read it as a book`,
);
console.log(
	"\nImport writes only the chapter (prose) layer. Mechanisms, toolkit, and glossary stay ",
);
console.log("author-gated so the compiler's separation invariants hold.");
