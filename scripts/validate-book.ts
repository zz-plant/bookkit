import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { readItemPath } from "../packages/astro-bookkit/src/book/read-routes";
import { isReleasedStatus } from "../packages/astro-bookkit/src/schemas/status";
import {
	checkBookContent,
	readBookSources,
} from "../packages/astro-bookkit/src/validators/book-validator";
import {
	firstUnlinkedGlossaryMentions,
	glossaryTermsFrom,
} from "../packages/astro-bookkit/src/validators/glossary-mentions";
import { listBookDirs, listFilesRecursive, repoRoot } from "./_lib";
import { type Finding, groupFindingsByFile } from "./lib/authoring";
import { parseScriptArgs, requireExistingBook } from "./lib/cli";
import { compileBookFindings } from "./lib/compile-mdx";
import { checkReleaseNote } from "./lib/release-notes";
import { starterTemplateRootIn } from "./lib/scaffold-book";
import { extractSiteConfig } from "./lib/site-config";

/**
 * The placeholder prose a new book's book.config.ts starts with, read from
 * the starter template, so an edited template needs no change here. Not
 * site.url: https://<slug>.book may be the domain the author means to buy,
 * and deploy already says when the Worker does not serve it.
 */
function starterPlaceholders(root: string) {
	const template = join(starterTemplateRootIn(root), "src", "book.config.ts");
	if (!existsSync(template)) return [];
	const source = readFileSync(template, "utf8");
	const fields = [
		{
			field: "objectives.readerStart",
			key: "readerStart",
			shown: "shows on the About this book page (/read/overview)",
			meaning: "who the reader is before the first page",
		},
		{
			field: "objectives.readerEnd",
			key: "readerEnd",
			shown: "shows on the About this book page (/read/overview)",
			meaning: "what the reader can do after the last page",
		},
		{
			field: "objectives.transformation",
			key: "transformation",
			shown: "shows on the About this book page (/read/overview)",
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
			shown: "shows on the About this book page (/read/overview)",
			meaning: "the book's core claim about what causes the problem it covers",
		},
	];
	return fields.flatMap((field) => {
		const value = source.match(
			new RegExp(`\\b${field.key}:\\s*("(?:[^"\\\\]|\\\\.)*")`),
		)?.[1];
		return value ? [{ ...field, text: value }] : [];
	});
}

const args = parseScriptArgs(
	{
		summary:
			"Validates one book: its content, its frame, and, once it is published\nor stable, release readiness.",
		usage: ["bun run validate:book -- --book <book> [--release] [--json]"],
		options: [
			["--book <book>", "The book app to validate"],
			[
				"--release",
				"Release rules whatever the book's status: what publishing\nit would hold it to (bookkit publish runs this)",
			],
			[
				"--json",
				"One JSON object: { book, status, releaseRules, ok,\nfindings, info }",
			],
		],
		notes:
			"The book's status in book.config.ts decides the rules. A published or stable\nbook gets release rules: no draft records, broken links and prerequisites are\nerrors, and the site must be indexable at a public URL. Any other book is\nchecked as a draft. Errors exit 1; warnings never do. INFO lists each\nchapter's first use of a glossary term that is not linked to its entry; it\nis advice and never fails. (--mode and --no-drafts are accepted for older\ncallers and ignored.)",
		examples: [
			"bun run validate:book -- --book on-call",
			"bun run validate:book -- --book on-call --json",
		],
	},
	{
		book: "string",
		json: "boolean",
		release: "boolean",
		mode: "string",
		"no-drafts": "boolean",
	},
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
const content = checkBookContent({
	workspaceRoot,
	bookSlug: book,
	releaseMode: args.release === true,
});
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
		.filter((finding) => finding.code === "MDX_HTML_COMMENT" && finding.file)
		.map((finding) => join(workspaceRoot, finding.file as string)),
);
for (const finding of await compileBookFindings(
	workspaceRoot,
	book,
	reportedComment,
)) {
	findings.push({ ...finding, file: relative(workspaceRoot, finding.file) });
}

// Release notes are not a content section, but the release page drops a
// note it cannot date: say so instead of losing it silently.
const releasesDir = join(contentDir, "releases");
if (existsSync(join(workspaceRoot, releasesDir))) {
	for (const name of listFilesRecursive(join(workspaceRoot, releasesDir))) {
		if (!/\.mdx?$/.test(name)) continue;
		const file = join(releasesDir, name);
		for (const finding of checkReleaseNote(
			readFileSync(join(workspaceRoot, file), "utf8"),
		)) {
			findings.push({ ...finding, file });
		}
	}
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
	for (const placeholder of starterPlaceholders(workspaceRoot)) {
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

// Each chapter's first use of a glossary term, when it is not a link. The
// site does not link terms itself, so this is where an author learns which
// ones a reader meets undefined. Advice only: it is never an error or a
// warning, and a chapter that links a term at its first use is not listed.
const sources = readBookSources(workspaceRoot, book);
const terms = glossaryTermsFrom(sources.glossary);
const info = sources.chapter
	.flatMap((chapter) => firstUnlinkedGlossaryMentions(chapter, terms))
	.map((mention) => {
		const href = readItemPath("glossary", mention.slug);
		return {
			level: "info" as const,
			code: "GLOSSARY_TERM_UNLINKED",
			file: relative(workspaceRoot, mention.file),
			line: mention.line,
			term: mention.term,
			href,
			message: `First use of "${mention.term}" in this chapter is not linked to its glossary entry`,
			fix: `Link it where the chapter first uses it: [${mention.term.toLowerCase()}](${href})`,
		};
	});

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
				// Advice that never fails: { code, file, line, term, href, message, fix }.
				info,
			},
			null,
			2,
		),
	);
} else {
	const status = content.status ?? "draft";
	console.log(
		`\nVALIDATE ${book} (${status}${content.releaseMode ? `${args.release && !isReleasedStatus(status) ? ", checked as if published" : ""}, so release rules apply: no drafts, and broken links are errors` : ""})`,
	);
	if (info.length > 0) {
		console.log(
			`\nINFO (${info.length}): glossary terms a chapter uses before linking them. Advice only; never fails.`,
		);
		for (const item of info) {
			console.log(`- ${item.file}:${item.line} "${item.term}" → ${item.href}`);
		}
		console.log(
			`  fix: link the term where the chapter first uses it, e.g. [${info[0].term.toLowerCase()}](${info[0].href}).`,
		);
	}
	if (warnings.length > 0) {
		// One line per file, so a tool missing five fields reads as one gap.
		const lines = warnings.map((item) =>
			item.file
				? `${item.message}: ${join(workspaceRoot, item.file)}`
				: item.message,
		);
		const grouped = groupFindingsByFile(lines);
		// Say so when lines group warnings, or the count reads as lines missing.
		console.log(
			`\nWARNINGS (${warnings.length}${grouped.length < warnings.length ? ` on ${grouped.length} lines; a file's warnings share one` : ""})`,
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
		for (const line of grouped) {
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
	const infoCount = info.length > 0 ? `, ${info.length} info` : "";
	console.log(
		errors.length > 0
			? `\n✗ ${book}: ${errors.length} error${errors.length === 1 ? "" : "s"}, ${warnings.length} warning${warnings.length === 1 ? "" : "s"}${infoCount}`
			: `\n✓ ${book}: no errors, ${warnings.length} warning${warnings.length === 1 ? "" : "s"}${infoCount}`,
	);
}

process.exit(errors.length > 0 ? 1 : 0);
