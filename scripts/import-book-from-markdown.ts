import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { requireArg } from "./_lib";

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

const titleFromFile = (name: string): string => {
	const base = name
		.replace(/\.(md|mdx)$/i, "")
		.replace(/^\d+[\s_-]*/i, "")
		.replace(/[-_]+/g, " ")
		.trim();
	return base.charAt(0).toUpperCase() + base.slice(1);
};

const sourceFiles = listMarkdown(sourceDir);
if (sourceFiles.length === 0) {
	console.error(`No markdown files found under ${sourceDir}`);
	process.exit(1);
}

const written: string[] = [];
const skipped: string[] = [];

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

	const body = readFileSync(file, "utf8").trim();
	const frontmatter = [
		"---",
		`slug: ${slug}`,
		"status: draft",
		`title: "${titleFromFile(file)}"`,
		"---",
		"",
		body,
		"",
	].join("\n");

	writeFileSync(target, frontmatter, "utf8");
	written.push(target);
});

console.log(
	`Imported ${written.length} chapter(s) into apps/${book}/src/content/book/chapters/`,
);
for (const file of written) console.log(`  + ${file}`);
if (skipped.length > 0) {
	console.log(`Skipped ${skipped.length} file(s):`);
	for (const file of skipped) console.log(`  ~ ${file}`);
	console.log("Re-run with --force to overwrite existing chapters.");
}

console.log("\nNext steps:");
console.log(
	`  1. bun run new:mechanism      — register recurring patterns as mechanisms`,
);
console.log(
	`  2. bun run new:tool           — bind action primitives to mechanisms`,
);
console.log(
	`  3. bun run check:suggestions -- --book ${book}  — let the analyzer propose drafts`,
);
console.log(`  4. bun run validate -- --book ${book}`);
console.log(
	"\nImport writes only the chapter (prose) layer. Mechanisms, toolkit, and glossary stay ",
);
console.log("author-gated so the compiler's separation invariants hold.");
