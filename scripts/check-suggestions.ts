import { existsSync } from "node:fs";
import { relative } from "node:path";
import {
	type ConceptExample,
	deriveComplianceMatrix,
	describeExample,
	findRecurringTerms,
	type MechanismRecord,
	runBookSuggestions,
	summarizeCompliance,
	type ToolRecord,
} from "../packages/astro-bookkit/src/suggestions";
import { listBookDirs, optionalArg, repoRoot } from "./_lib";
import { booksFromArgv } from "./lib/book-args";
import { corpusScope, readCorpusBooks } from "./lib/corpus-scope";
import { loadBookContent } from "./lib/load-book";

/**
 * check:suggestions — what the deterministic analyzers suggest for a book.
 *
 *   bun run check:suggestions                  # every book
 *   bun run check:suggestions on-call          # one book (or -- --book on-call)
 *   bun run check:suggestions on-call --info   # include info-level findings
 *
 * Each book's report starts with what was read, so "no suggestions" is never
 * confused with "nothing analyzed".
 */

const { books } = booksFromArgv(listBookDirs(), {
	usage:
		"bun run check:suggestions [book] [--info] [--mode error] [--max-proposals <n>]",
	valueFlags: ["--mode", "--max-proposals"],
});
const mode = optionalArg("--mode") ?? "warn";
const showInfo = process.argv.includes("--info");
const maxProposals = Number(optionalArg("--max-proposals") ?? "5");

type CrossBookRecord = {
	book: string;
	slug: string;
	definition: string;
};
const crossBookRecords: CrossBookRecord[] = [];

const plural = (count: number, word: string) =>
	`${count} ${word}${count === 1 ? "" : "s"}`;

/** Warnings found, or null when the book has no content to analyze. */
const checkBook = (book: string): number | null => {
	const content = loadBookContent(book);
	if (!existsSync(content.bookRoot)) {
		console.log(
			`\n[${book}] nothing analyzed: ${relative(repoRoot(), content.bookRoot)} does not exist.`,
		);
		return null;
	}

	for (const mechanism of content.mechanisms) {
		crossBookRecords.push({
			book,
			slug: mechanism.slug,
			definition: mechanism.definition,
		});
	}

	const recurring = findRecurringTerms(content.chapterBodies, {
		vocabulary: content.vocabulary,
	});
	const suggestions = runBookSuggestions({
		book,
		mechanisms: content.mechanisms,
		chapters: content.chapters,
		examples: content.examples,
		chapterBodies: content.chapterBodies,
		conceptFlags: recurring.candidates,
		vocabulary: content.vocabulary,
		frame: content.frame,
		tools: content.tools,
		maxMechanismProposals: maxProposals,
	});

	console.log(
		`\n[${book}] read ${plural(recurring.filesRead, "chapter")} (${recurring.wordsRead} words of prose), ${plural(content.mechanisms.length, "mechanism")}, ${plural(content.examples.length, "example")}, ${plural(content.tools.length, "tool")}`,
	);
	if (recurring.filesRead === 0) {
		console.log(
			`  no chapter prose to look for recurring terms in (${relative(repoRoot(), content.bookRoot)}/chapters).`,
		);
	}
	if (recurring.registered.length > 0) {
		console.log(
			`  recurring terms already registered: ${recurring.registered.map((flag) => `${flag.term} (${flag.occurrences}×)`).join(", ")}`,
		);
	}

	const visible = suggestions.filter((s) => showInfo || s.severity !== "info");
	const hidden = suggestions.length - visible.length;
	const warnings = visible.filter((s) => s.severity === "warning");
	const local = (file: string) => file.replace(`${content.bookRoot}/`, "");

	if (visible.length === 0) {
		console.log(
			`  no suggestions${hidden > 0 ? ` (${plural(hidden, "info-level finding")}; --info shows them)` : ""}.`,
		);
	} else {
		console.log(
			`SUGGESTIONS (${visible.length})${hidden > 0 ? `, plus ${hidden} at info level (--info)` : ""}`,
		);
		for (const suggestion of visible) {
			const location = suggestion.file ? local(suggestion.file) : "(book)";
			console.log(
				`- [${suggestion.category}/${suggestion.severity}] ${location}: ${suggestion.message}`,
			);
			const example = suggestion.evidence.example as ConceptExample | undefined;
			if (example) {
				console.log(`    e.g. ${describeExample(example, content.bookRoot)}`);
			}
			console.log(`    → ${suggestion.nextAction}`);
		}
	}

	if (content.frame === "runbook") {
		printComplianceMatrix(book, content.mechanisms, content.tools);
	}

	return warnings.length;
};

const printComplianceMatrix = (
	book: string,
	mechanisms: MechanismRecord[],
	tools: ToolRecord[],
): void => {
	const rows = deriveComplianceMatrix(mechanisms, tools);
	if (rows.length === 0) return;

	const summary = summarizeCompliance(rows);
	console.log(`\nCOMPLIANCE MATRIX (${book})`);
	console.log(
		`Controls: ${summary.total} rows, ${summary.covered} with tool coverage`,
	);
	for (const row of rows) {
		const toolsLabel =
			row.tools.length > 0 ? row.tools.join(", ") : "(none — uncovered)";
		const drilled = row.drillReady ? " ✓drilled" : "";
		console.log(
			`- ${row.control} → ${row.mechanism} [${toolsLabel}]${drilled}`,
		);
	}
	if (summary.uncoveredControls.length > 0) {
		console.log(`Uncovered controls: ${summary.uncoveredControls.join(", ")}`);
	}
};

/**
 * A slug names one mechanism within a corpus (corpus.json "books"), so the
 * same slug in two of its books must mean the same thing. Books outside the
 * corpus may reuse a slug.
 */
const printCrossBookMechanismIdentity = (analyzed: string[]): number => {
	const scope = corpusScope(analyzed, readCorpusBooks());
	if (scope.shared.length < 2) {
		console.log(
			analyzed.length === 1
				? `\nCROSS-BOOK CHECK: not run; it compares books in one corpus, and this run analyzed only ${analyzed[0]}.`
				: `\nCROSS-BOOK CHECK: not run; fewer than two of the books analyzed are in corpus.json "books".`,
		);
		return 0;
	}
	const bySlug = new Map<string, CrossBookRecord[]>();
	for (const record of crossBookRecords) {
		if (!scope.shared.includes(record.book)) continue;
		const list = bySlug.get(record.slug) ?? [];
		list.push(record);
		bySlug.set(record.slug, list);
	}

	const collisions = [...bySlug.entries()].filter(
		([, records]) => records.length > 1,
	);
	if (collisions.length === 0) {
		console.log(
			`\nCROSS-BOOK CHECK: no mechanism slug is defined in more than one of ${scope.shared.join(", ")}.`,
		);
		return 0;
	}

	console.log(`\nCROSS-BOOK MECHANISM COLLISIONS (${collisions.length})`);
	for (const [slug, records] of collisions) {
		const diverging = new Set(records.map((r) => r.definition.trim())).size > 1;
		console.log(
			`- [mechanism-identity/${diverging ? "warning" : "advisory"}] slug "${slug}" is defined in: ${records.map((r) => r.book).join(", ")}`,
		);
		for (const record of records) {
			console.log(
				`    ${record.book}: ${record.definition || "(no definition)"}`,
			);
		}
		console.log(
			`    → ${
				diverging
					? "Definitions diverge. Reconcile the boundaries to one referent, or rename one slug — slugs are durable identities (design-notes Invariant 1)."
					: "Definitions agree at name level. Keep the definitions cross-linked so they do not drift apart."
			}`,
		);
	}
	return collisions.length;
};

let totalWarnings = 0;
const analyzed: string[] = [];
const empty: string[] = [];
for (const book of books) {
	const warnings = checkBook(book);
	if (warnings === null) empty.push(book);
	else {
		analyzed.push(book);
		totalWarnings += warnings;
	}
}

if (analyzed.length > 0) {
	totalWarnings += printCrossBookMechanismIdentity(analyzed);
}

if (empty.length > 0) {
	console.error(
		`\nNothing was analyzed for ${empty.join(", ")}: no content directory. Check the book name, or create content with bun run bookkit new.`,
	);
	process.exit(1);
}

const shouldFail = mode === "error" && totalWarnings > 0;
process.exit(shouldFail ? 1 : 0);
