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
import { listBookDirs, repoRoot } from "./_lib";
import { type Finding, groupFindingsByFile } from "./lib/authoring";
import { parseScriptArgs, requireExistingBook } from "./lib/cli";
import { compileBookFindings } from "./lib/compile-mdx";

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

// Every rule the book is held to comes from the engine
// (validators/book-validator.ts), the same function MCP and generated
// projects call.
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
