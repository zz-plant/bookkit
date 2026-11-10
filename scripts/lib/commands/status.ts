import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractPageFacts } from "../../../packages/astro-bookkit/src/markdown/pageFacts";
import { shortBookTitle } from "../../../packages/astro-bookkit/src/seo/page-meta";
import { repoRoot } from "../../_lib";
import { summarizeBook } from "../authoring";
import { buildB1Report } from "../b1-report";
import { writeFocusBook } from "../cli";
import { formatCoverageMap, loadCoverageMap } from "../coverage-map";
import { args, books, focusBook, requireBook } from "./context";

/**
 * `bookkit status`, `map`, `bets`, `list`, and `use`: the books, what is in
 * them, and which one is current.
 */

/** `status [book] [--json]`: every book's counts, and the commands for one. */
export async function statusCommand() {
	if (args.includes("--json")) {
		console.log(
			JSON.stringify(
				{ books: await Promise.all(books.map(summarizeBook)) },
				null,
				2,
			),
		);
	} else {
		const named = args[1] && !args[1].startsWith("--") ? args[1] : undefined;
		await printStatus(
			named ? requireBook(named, "bun run bookkit status [book]") : undefined,
		);
	}
	process.exit(0);
}

/** `map [book] [--json]`: which chapters bind which mechanisms. */
export async function mapCommand() {
	const named = args.slice(1).find((arg) => !arg.startsWith("--"));
	const map = await loadCoverageMap(
		requireBook(named, "bun run bookkit map [book] [--json]"),
		books,
	);
	if (args.includes("--json")) {
		console.log(JSON.stringify(map, null, 2));
	} else {
		console.log(`\n${formatCoverageMap(map).join("\n")}\n`);
	}
	process.exit(0);
}

/** `bets [--json]`: the maintainers' active bet, measured from git. */
export async function betsCommand() {
	// The maintainers' own measure of the active bet (docs/bets.md), kept
	// out of the default output, which is for any author.
	const report = await buildB1Report();
	if (args.includes("--json")) {
		console.log(JSON.stringify({ b1: report }, null, 2));
	} else {
		printBets(report);
	}
	process.exit(0);
}

/** `list`: the books. */
export function listCommand() {
	console.log("Available books in workspace:");
	for (const b of books) {
		console.log(`- ${b}`);
	}
	process.exit(0);
}

/** `use [book] [--clear]`: sets, shows, or clears the current book. */
export function useCommand() {
	const requested = args[1] && !args[1].startsWith("--") ? args[1] : undefined;
	if (args.includes("--clear")) {
		writeFocusBook(undefined);
		console.log("No current book. Commands will ask, or take a book name.");
		process.exit(0);
	}
	if (!requested) {
		console.log(
			focusBook
				? `Current book: ${focusBook}. Change it with bun run bookkit use <book>, or clear it with --clear.`
				: `No current book. Set one with bun run bookkit use <book> (${books.join(", ")}).`,
		);
		process.exit(0);
	}
	const book = requireBook(requested, "bun run bookkit use <book>");
	writeFocusBook(book);
	console.log(
		`Current book: ${book}. Commands that take a book now default to it, e.g. bun run bookkit new chapter "<title>".`,
	);
	process.exit(0);
}

/** Your books, and the commands for one: `book`, else the current one. */
async function printStatus(book?: string) {
	if (books.length === 0) {
		console.log(
			"\nBOOKKIT · no books yet\n\nStart one:  bun run bookkit new book <slug>\nOr see what your own notes would become:  bun run bookkit try <folder>\n",
		);
		return;
	}
	const summaries = await Promise.all(books.map(summarizeBook));
	const nameWidth = Math.max(...books.map((book) => book.length));
	const titleWidth = Math.min(
		40,
		Math.max(...summaries.map((s) => shortBookTitle(s.title).length)),
	);
	console.log(
		`\nBOOKKIT · ${books.length} book${books.length === 1 ? "" : "s"}\n`,
	);
	for (const s of summaries) {
		const title = shortBookTitle(s.title);
		const chapters = `${s.chapters} chapter${s.chapters === 1 ? "" : "s"}${s.stubChapters.length > 0 ? ` (${s.stubChapters.length} stub${s.stubChapters.length === 1 ? "" : "s"})` : ""}`;
		console.log(
			`  ${s.book.padEnd(nameWidth)}  ${(title.length > titleWidth ? `${title.slice(0, titleWidth - 1)}…` : title).padEnd(titleWidth)}  ${s.status.padEnd(9)}  ${chapters} · ${s.mechanisms} mechanism${s.mechanisms === 1 ? "" : "s"} · ${s.tools} tool${s.tools === 1 ? "" : "s"}`,
		);
	}
	if (summaries.some((s) => s.stubChapters.length > 0)) {
		console.log(
			"\n  Stubs are chapters with too little prose to read yet (site.minIndexableWords, default 60 words). They stay out of search until written.",
		);
	}

	// The commands for one book, from first chapter to publishing. With no
	// current book, a single book stands in; otherwise they name <book>.
	const focus =
		summaries.find((summary) => summary.book === (book ?? focusBook)) ??
		(summaries.length === 1 ? summaries[0] : undefined);
	const focusName = focus?.book ?? "<book>";
	const stub = focus?.stubChapters[0];
	const moreStubs = focus?.stubChapters.slice(1) ?? [];
	const stubPath = stub
		? join("apps", focusName, "src", "content", "book", "chapters", stub)
		: undefined;
	const stubWords = stubPath
		? extractPageFacts(readFileSync(join(repoRoot(), stubPath), "utf8"))
				.wordCount
		: 0;
	const steps: Array<[string, string, string]> = [
		stubPath
			? [
					"write",
					stubPath,
					`the next stub (${stubWords} words so far)${moreStubs.length > 0 ? `; then ${moreStubs.map((file) => file.replace(/\.mdx?$/, "")).join(", ")}` : ""}`,
				]
			: [
					"write",
					`bun run bookkit new chapter ${focusName} "<title>"`,
					"start the next chapter",
				],
		...(stub
			? [
					[
						"draft",
						`bun run bookkit draft ${focusName} ${stub.replace(/\.mdx?$/, "")}`,
						"or have models draft it: candidates from writer commands, a winner from judge commands",
					] as [string, string, string],
				]
			: []),
		[
			"check",
			`bun run bookkit check ${focusName}`,
			"errors to fix before anyone reads it",
		],
		[
			"preview",
			`bun run bookkit dev ${focusName}`,
			"the site in your browser; it updates as you save",
		],
		[
			"build",
			`bun run bookkit build ${focusName}`,
			`the site, PDF, and EPUB, in apps/${focusName}/dist`,
		],
		[
			"deploy",
			`bun run bookkit deploy ${focusName} --dry-run`,
			"checks, builds, and rehearses; drop --dry-run to publish to Cloudflare",
		],
	];
	console.log(
		focus
			? `\nYour book: ${focusName}${focus.book === focusBook || focus.book === book ? "" : " (the only one)"}`
			: "\nName your book in each command, or set it once with bun run bookkit use <book>:",
	);
	// Short commands share a column; a long one puts its note on the next line.
	const width = Math.min(
		44,
		Math.max(...steps.map(([, command]) => command.length)),
	);
	for (const [verb, command, what] of steps) {
		console.log(
			command.length > width
				? `  ${verb.padEnd(9)}${command}\n  ${" ".repeat(9 + width)}   ${what}`
				: `  ${verb.padEnd(9)}${command.padEnd(width)}   ${what}`,
		);
	}
	console.log(
		"\n  bun run bookkit try <folder>   what Bookkit would make of your own notes (writes nothing)\n  bun run bookkit help           every command\n",
	);
}

/** Bet B1's test as measured from git history (docs/bets.md). */
function printBets(b1: Awaited<ReturnType<typeof buildB1Report>>) {
	if ("unavailable" in b1) {
		console.log(`\nB1: not measured (${b1.unavailable}).\n`);
		return;
	}
	console.log(
		`\nB1 · one argument, three drafts · ${b1.verdict}${b1.daysLeft !== undefined ? ` · ${b1.daysLeft} days to ${b1.killBy}` : ""}`,
	);
	console.log(`  ${b1.summary}`);
	console.log(
		`  Mechanisms across the corpus books: ${b1.mechanisms.before} at the start, ${b1.mechanisms.now} now${b1.mechanisms.added.length ? `; new: ${b1.mechanisms.added.join(", ")}` : ""}${b1.mechanisms.retired.length ? `; merged away: ${b1.mechanisms.retired.join(", ")}` : ""}.`,
	);
	for (const chapter of b1.drafted) {
		console.log(
			`  ✎ ${chapter.file} (${chapter.words} words)${chapter.newMechanisms.length ? ` introduces ${chapter.newMechanisms.join(", ")}` : chapter.mechanisms.length ? " binds existing mechanisms only" : ` binds no mechanism (bun run bookkit map ${chapter.book})`}`,
		);
	}
	console.log("");
}
