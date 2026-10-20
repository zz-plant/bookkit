import {
	existsSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { buildExportParts } from "../packages/astro-bookkit/src/exports/content-parsing";
import { createFileImageLoader } from "../packages/astro-bookkit/src/exports/images";
import type { ExportEntry } from "../packages/astro-bookkit/src/exports/types";
import { HAS_SCHEME } from "../packages/astro-bookkit/src/utils/links";
import { ensureDir, listBookDirs, repoRoot } from "./_lib";
import { loadBookConfig } from "./lib/authoring";
import { parseScriptArgs, requireExistingBook } from "./lib/cli";
import {
	gitbookEntries,
	gitbookPage,
	gitbookPagePath,
	gitbookSummary,
	mdxToGitbookMarkdown,
} from "./lib/gitbook";
import { loadRawModules } from "./lib/raw-modules";

/** Written into every export, so the next one knows the folder is its own to replace. */
const EXPORT_MARKER = ".bookkit-export";

const args = parseScriptArgs(
	`Export a book as a GitBook folder: README.md, SUMMARY.md, and one Markdown page per
chapter, mechanism, toolkit action, glossary term, and example, in reading order.

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

const config = (await loadBookConfig(book)) ?? {};
const text = (value: unknown) =>
	typeof value === "string" && value.trim() ? value.trim() : undefined;
const field = (path: string[]) =>
	path.reduce<unknown>(
		(value, key) =>
			value && typeof value === "object"
				? (value as Record<string, unknown>)[key]
				: undefined,
		config,
	);
const title = text(config.title) ?? book;
const siteUrl = text(field(["site", "url"]));
const mechanisms = Array.isArray(config.mechanisms) ? config.mechanisms : [];

const parts = buildExportParts(loadRawModules(contentDir), {
	defaultLocale: text(field(["localization", "defaultLocale"])),
	mechanismOrder: mechanisms
		.map((mechanism) => text((mechanism as { slug?: unknown }).slug))
		.filter((slug): slug is string => Boolean(slug)),
});
const entries = gitbookEntries(parts);
if (entries.length === 0) {
	console.error(
		`${book} has no chapters, mechanisms, toolkit actions, glossary terms, or examples to export (looked in ${contentDir}).`,
	);
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
	const existing = readdirSync(outDir);
	if (existing.length > 0 && !existing.includes(EXPORT_MARKER)) {
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

// Local images go in .gitbook/assets/, where GitBook keeps a space's files.
const appDir = join(root, "apps", book);
const loadImage = createFileImageLoader({
	publicDir: join(appDir, "public"),
	sourceBase: join(appDir, "src", "lib"),
});
const assets = new Map<string, string>();
const usedAssets = new Set<string>();
const copyImage = (src: string, entry: ExportEntry): string | null => {
	if (HAS_SCHEME.test(src) || src.startsWith("//")) return null;
	const result = loadImage(src, entry);
	if ("problem" in result) {
		console.warn(
			`${gitbookPagePath(entry)}: image ${src} ${result.problem}; the page links it as written. ${result.fix}`,
		);
		return null;
	}
	let path = assets.get(result.file.key);
	if (!path) {
		const dot = result.file.name.lastIndexOf(".");
		const stem = dot > 0 ? result.file.name.slice(0, dot) : result.file.name;
		const extension = dot > 0 ? result.file.name.slice(dot) : "";
		path = `.gitbook/assets/${result.file.name}`;
		for (let n = 2; usedAssets.has(path); n += 1) {
			path = `.gitbook/assets/${stem}-${n}${extension}`;
		}
		usedAssets.add(path);
		assets.set(result.file.key, path);
		ensureDir(dirname(join(outDir, path)));
		writeFileSync(join(outDir, path), result.file.bytes);
	}
	return path;
};

const pages = new Map(
	entries.map((entry) => [
		`${entry.kind}:${entry.slug}`,
		gitbookPagePath(entry),
	]),
);
for (const entry of entries) {
	const path = join(outDir, gitbookPagePath(entry));
	ensureDir(dirname(path));
	writeFileSync(
		path,
		gitbookPage(
			entry,
			mdxToGitbookMarkdown(entry, pages, { siteUrl, copyImage }),
		),
		"utf8",
	);
}

const author = text(field(["author", "name"]));
const description = text(field(["site", "defaultMeta", "description"]));
writeFileSync(
	join(outDir, "README.md"),
	[
		`# ${title}`,
		author ? `By ${author}` : null,
		description ?? null,
		siteUrl ? `Read it online at ${siteUrl}.` : null,
	]
		.filter(Boolean)
		.join("\n\n")
		.concat("\n"),
	"utf8",
);
writeFileSync(join(outDir, "SUMMARY.md"), gitbookSummary(parts), "utf8");

console.log(
	`GitBook export written to ${outDir}: ${entries.length} page(s)${assets.size > 0 ? ` and ${assets.size} image(s)` : ""}.`,
);
