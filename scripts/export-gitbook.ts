import {
	copyFileSync,
	existsSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { ensureDir, listBookDirs, repoRoot } from "./_lib";
import { parseScriptArgs, requireExistingBook } from "./lib/cli";

type SectionEntry = {
	relPath: string;
	title: string;
};

/** Written into every export, so the next one knows the folder is its own to replace. */
const EXPORT_MARKER = ".bookkit-export";

const args = parseScriptArgs(
	`Export a book's Markdown as a GitBook folder (README.md and SUMMARY.md, plus the book's files).

Usage:
  bun run export:gitbook -- --book <book> [--out <dir>]

Options:
  --book <book>   The book app to export
  --out <dir>     Where to write it (default: apps/<book>/exports/gitbook). It must be
                  missing, empty, or an earlier export, which is replaced.
  -h, --help      Show this help`,
	{ book: "string", out: "string" },
	["book"],
);

const { book } = args;
requireExistingBook(book, listBookDirs());
const root = repoRoot();
const contentDir = join(root, "apps", book, "src", "content", "book");

if (!existsSync(contentDir)) {
	console.error(`Book content directory not found: ${contentDir}`);
	process.exit(1);
}

const outDir = resolve(
	args.out ?? join(root, "apps", book, "exports", "gitbook"),
);

// The folder is replaced, so only one an earlier export wrote may have files in it.
if (existsSync(outDir)) {
	if (!statSync(outDir).isDirectory()) {
		console.error(`--out ${outDir} is a file, not a folder.`);
		process.exit(1);
	}
	const entries = readdirSync(outDir);
	if (entries.length > 0 && !entries.includes(EXPORT_MARKER)) {
		console.error(
			`Refusing to replace ${outDir}: it holds files an earlier export did not write (it has no ${EXPORT_MARKER}). Choose a new or empty folder with --out, or move those files out first.`,
		);
		process.exit(1);
	}
}

rmSync(outDir, { recursive: true, force: true });
ensureDir(outDir);
writeFileSync(
	join(outDir, EXPORT_MARKER),
	`Written by bun run export:gitbook for ${book}. The next export deletes and rewrites this folder.\n`,
	"utf8",
);

const markdownFiles = collectMarkdownFiles(contentDir);
const assetFiles = collectNonMarkdownFiles(contentDir);
const hasRootReadme = markdownFiles.some(
	(file) => relative(contentDir, file).replace(/\\/g, "/") === "README.md",
);

for (const filePath of markdownFiles) {
	const relPath = relative(contentDir, filePath);
	const destPath = join(outDir, relPath);
	ensureDir(dirname(destPath));
	writeFileSync(destPath, readFileSync(filePath, "utf8"), "utf8");
}

for (const filePath of assetFiles) {
	const relPath = relative(contentDir, filePath);
	const destPath = join(outDir, relPath);
	ensureDir(dirname(destPath));
	copyFileSync(filePath, destPath);
}

if (!hasRootReadme) {
	const fallbackReadme = `# ${toTitleCase(book)}\n\nThis export was generated from Bookkit content records.\n`;
	writeFileSync(join(outDir, "README.md"), fallbackReadme, "utf8");
}

const summary = buildSummary(markdownFiles, contentDir);
writeFileSync(join(outDir, "SUMMARY.md"), summary, "utf8");

console.log(`GitBook export written to ${outDir}`);

function collectMarkdownFiles(dir: string): string[] {
	const entries = readdirSync(dir, { withFileTypes: true });
	const results: string[] = [];
	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...collectMarkdownFiles(fullPath));
			continue;
		}
		if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") {
			results.push(fullPath);
		}
	}
	return results.sort();
}

function collectNonMarkdownFiles(dir: string): string[] {
	const entries = readdirSync(dir, { withFileTypes: true });
	const results: string[] = [];
	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...collectNonMarkdownFiles(fullPath));
			continue;
		}
		if (entry.isFile() && extname(entry.name).toLowerCase() !== ".md") {
			results.push(fullPath);
		}
	}
	return results.sort();
}

function buildSummary(files: string[], baseDir: string): string {
	const sections = new Map<string, SectionEntry[]>();

	for (const filePath of files) {
		const relPath = relative(baseDir, filePath).replace(/\\/g, "/");
		if (relPath === "README.md") continue;

		const [section] = relPath.split("/");
		const title = titleFromFile(filePath);
		const entry: SectionEntry = { relPath, title };
		const bucket = sections.get(section) ?? [];
		bucket.push(entry);
		sections.set(section, bucket);
	}

	const lines = ["# Summary", "", "* [Introduction](README.md)"];
	const orderedSections = Array.from(sections.keys()).sort();

	for (const section of orderedSections) {
		const entries = sections.get(section) ?? [];
		entries.sort((a, b) => a.relPath.localeCompare(b.relPath));
		const header = section === "." ? "Other" : toTitleCase(section);
		lines.push(`* ${header}`);
		for (const entry of entries) {
			lines.push(`  * [${entry.title}](${entry.relPath})`);
		}
	}

	lines.push("");
	return lines.join("\n");
}

function titleFromFile(filePath: string): string {
	const contents = readFileSync(filePath, "utf8");
	const match = contents.match(/^#\s+(.+)$/m);
	if (match) return match[1].trim();
	return toTitleCase(basename(filePath, extname(filePath)));
}

function toTitleCase(value: string): string {
	return value
		.replace(/[-_]+/g, " ")
		.split(" ")
		.filter(Boolean)
		.map((part) => part[0]?.toUpperCase() + part.slice(1))
		.join(" ");
}
