import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { checkBookContent } from "../packages/astro-bookkit/src/validators/book-validator";
import { listBookDirs, listFilesRecursive, repoRoot } from "./_lib";
import { type Finding, groupFindingsByFile } from "./lib/authoring";
import { parseScriptArgs, requireExistingBook } from "./lib/cli";
import { compileFinding, compileMdx } from "./lib/compile-mdx";
import { starterTemplateRootIn } from "./lib/scaffold-book";
import { extractSiteConfig } from "./lib/site-config";

/**
 * The placeholder values a new book's book.config.ts starts with, read from
 * the starter template, so an edited template needs no change here.
 */
function starterPlaceholders(root: string, book: string) {
	const template = join(starterTemplateRootIn(root), "src", "book.config.ts");
	if (!existsSync(template)) return [];
	const source = readFileSync(template, "utf8");
	const fields = [
		{
			field: "site.url",
			key: "url",
			shown: "canonical links, the sitemap, and link previews use",
			meaning: "the address the book will be published at",
		},
		{
			field: "objectives.readerStart",
			key: "readerStart",
			shown: "shows on the overview page",
			meaning: "who the reader is before the first page",
		},
		{
			field: "objectives.readerEnd",
			key: "readerEnd",
			shown: "shows on the overview page",
			meaning: "what the reader can do after the last page",
		},
		{
			field: "objectives.transformation",
			key: "transformation",
			shown: "shows on the overview page",
			meaning: "the change between the two, in one sentence",
		},
		{
			field: "frame.intent",
			key: "intent",
			meaning: "what the book moves the reader through",
		},
		{
			field: "causalStance",
			key: "causalStance",
			shown: "shows on the overview page",
			meaning: "the book's core claim about what causes the problem it covers",
		},
	];
	return fields.flatMap((field) => {
		const value = source.match(
			new RegExp(`\\b${field.key}:\\s*("(?:[^"\\\\]|\\\\.)*")`),
		)?.[1];
		return value
			? [{ ...field, text: value.replaceAll("__BOOK_SLUG__", book) }]
			: [];
	});
}

const args = parseScriptArgs(
	`Validate one book: its content, its frame, and, once it is published or stable, release readiness.

Usage:
  bun run validate:book -- --book <book> [--json]

Options:
  --book <book>   The book app to validate
  --json          One JSON object: { book, status, releaseRules, ok, findings }
  -h, --help      Show this help

The book's status in book.config.ts decides the rules. A published or stable
book gets release rules: no draft records, broken links and prerequisites are
errors, and the site must be indexable at a public URL. Any other book is
checked as a draft. Errors exit 1; warnings never do. (--mode and --no-drafts
are accepted for older callers and ignored.)`,
	{ book: "string", json: "boolean", mode: "string", "no-drafts": "boolean" },
	["book"],
);

const { book } = args;
requireExistingBook(book, listBookDirs());
const workspaceRoot = repoRoot();

const findings: Finding[] = [];
const error = (message: string, code: string, fix: string) =>
	findings.push({ level: "error", code, message, fix });

// Content and frame findings come from the engine (validators/book-validator.ts),
// the same function MCP and generated projects call.
const content = checkBookContent({ workspaceRoot, bookSlug: book });
for (const finding of content.findings) {
	findings.push({
		...finding,
		file: finding.file ? relative(workspaceRoot, finding.file) : undefined,
	});
}

// Every MDX file goes through the compiler the build uses, so a syntax error
// is reported here, with its line, instead of stopping the build. A file
// already reported for an HTML comment is skipped: that is the same failure.
const contentDir = join("apps", book, "src", "content", "book");
const reportedComment = new Set(
	findings
		.filter((finding) => finding.code === "MDX_HTML_COMMENT")
		.map((finding) => finding.file),
);
const mdxFiles = existsSync(join(workspaceRoot, contentDir))
	? listFilesRecursive(join(workspaceRoot, contentDir))
			.filter((file) => file.endsWith(".mdx"))
			.map((file) => join(contentDir, file))
			.filter((file) => !reportedComment.has(file))
	: [];
const compiled = await Promise.all(
	mdxFiles.map(async (file) => ({
		file,
		finding: compileFinding(
			await compileMdx(
				readFileSync(join(workspaceRoot, file), "utf8"),
				join(workspaceRoot, "apps", book),
			),
		),
	})),
);
for (const { file, finding } of compiled) {
	if (finding) findings.push({ ...finding, file });
}

const configFile = join("apps", book, "src", "book.config.ts");
if (content.releaseMode && existsSync(join(workspaceRoot, configFile))) {
	const siteConfig = extractSiteConfig(
		readFileSync(join(workspaceRoot, configFile), "utf8"),
	);
	const siteUrl = siteConfig?.url?.trim();
	if (siteConfig?.indexable === false) {
		error(
			`${configFile} sets site.indexable to false, but a ${content.status} book is meant to be found`,
			"RELEASE_NOT_INDEXABLE",
			'Remove indexable: false (or set it to true), or set status: "draft" until the book should be found.',
		);
	}
	if (!siteUrl || /localhost|127\.0\.0\.1|\.local(?=[:/]|$)/i.test(siteUrl)) {
		error(
			`${configFile} has ${siteUrl ? `a local site.url (${siteUrl})` : "no site.url"}, so canonical links, the sitemap, and link previews would not point at the published site`,
			"RELEASE_SITE_URL",
			'Set site.url to the public address readers will use, e.g. url: "https://example.com".',
		);
	}
}

// Starter text left in book.config.ts shows on the book's own pages: a
// warning while it is a draft, an error once it is published.
if (existsSync(join(workspaceRoot, configFile))) {
	const source = readFileSync(join(workspaceRoot, configFile), "utf8");
	const level = content.releaseMode ? "error" : "warning";
	for (const placeholder of starterPlaceholders(workspaceRoot, book)) {
		if (!source.includes(placeholder.text)) continue;
		findings.push({
			level,
			code: "CONFIG_PLACEHOLDER",
			message: `${configFile} still has the starter text for ${placeholder.field}${placeholder.shown ? `, which ${placeholder.shown}` : ""}`,
			fix: `Replace it with ${placeholder.meaning}.`,
		});
	}
}

const errors = findings.filter((finding) => finding.level === "error");
const warnings = findings.filter((finding) => finding.level === "warning");

if (args.json) {
	// One object per finding: `code` is stable, `file` is repo-relative, and
	// content findings carry the `field` and a `fix`.
	console.log(
		JSON.stringify(
			{
				book,
				status: content.status ?? "draft",
				releaseRules: content.releaseMode,
				ok: errors.length === 0,
				findings: [...errors, ...warnings],
			},
			null,
			2,
		),
	);
} else {
	const status = content.status ?? "draft";
	console.log(
		`\nVALIDATE ${book} (${status}${content.releaseMode ? ", so release rules apply: no drafts, and broken links are errors" : ""})`,
	);
	if (warnings.length > 0) {
		console.log(`\nWARNINGS (${warnings.length})`);
		// One line per file, so a tool missing five fields reads as one gap.
		const lines = warnings.map((item) =>
			item.file
				? `${item.message}: ${join(workspaceRoot, item.file)}`
				: item.message,
		);
		// Each line's fixes, once each: those of the warnings it groups.
		const fixesFor = (line: string): string[] => [
			...new Set(
				warnings
					.filter(
						(item, index) =>
							line === lines[index] ||
							(item.file !== undefined &&
								line.startsWith(
									`${relative(workspaceRoot, join(workspaceRoot, item.file))}:`,
								)),
					)
					.flatMap((item) => (item.fix ? [item.fix] : [])),
			),
		];
		let manyFixes = false;
		for (const line of groupFindingsByFile(lines)) {
			console.log(`- ${line}`);
			const fixes = fixesFor(line);
			// One fix in full; a file missing several fields gets one note below.
			if (fixes.length === 1) {
				console.log(`  fix: ${fixes[0].replace(/\n/g, "\n  ")}`);
			} else if (fixes.length > 1) {
				manyFixes = true;
			}
		}
		if (manyFixes) {
			console.log(
				"  (For a file missing several fields, bun run bookkit check <file> says what each one needs.)",
			);
		}
	}
	if (errors.length > 0) {
		// Every error on its own line, with what to change.
		console.log(`\nERRORS (${errors.length})`);
		for (const item of errors) {
			console.log(`- ${item.file ? `${item.file}: ` : ""}${item.message}`);
			if (item.fix) console.log(`  fix: ${item.fix.replace(/\n/g, "\n  ")}`);
		}
	}
	console.log(
		errors.length > 0
			? `\n✗ ${book}: ${errors.length} error${errors.length === 1 ? "" : "s"}, ${warnings.length} warning${warnings.length === 1 ? "" : "s"}`
			: `\n✓ ${book}: no errors, ${warnings.length} warning${warnings.length === 1 ? "" : "s"}`,
	);
}

process.exit(errors.length > 0 ? 1 : 0);
