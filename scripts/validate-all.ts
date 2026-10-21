import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { listBookDirs, repoRoot } from "./_lib";
import { parseScriptArgs, requireExistingBook } from "./lib/cli";

/**
 * Validates every book under apps/ with validate-book.ts, each under the rules
 * its status sets, or one book with --book. Exits 1 when any book has an error.
 */

const args = parseScriptArgs(
	{
		summary:
			"Validates every book in apps/, each under the rules its status sets,\nor one book with --book. Exits 1 when any book has an error.",
		usage: ["bun run validate [--book <book>] [--release] [--json]"],
		options: [
			["--book <book>", "Only this book (the same as validate:book)"],
			[
				"--release",
				"Release rules whatever each book's status: what publishing\nit would hold it to",
			],
			["--json", "One JSON object for the book; needs --book"],
		],
		examples: [
			"bun run validate",
			"bun run validate -- --book on-call",
			"bun run validate -- --book on-call --json",
		],
	},
	{ book: "string", release: "boolean", json: "boolean" },
);

const books = listBookDirs();
if (books.length === 0) {
	console.error(`No books found under ${join(repoRoot(), "apps")}.`);
	process.exit(1);
}
// One JSON object per book would not parse as one document.
if (args.json && !args.book) {
	console.error(
		"--json reports one book: add --book <book> (books: " +
			`${books.join(", ")}).`,
	);
	process.exit(1);
}
if (args.book) requireExistingBook(args.book, books);

const forwarded = [
	...(args.release ? ["--release"] : []),
	...(args.json ? ["--json"] : []),
];
const selected = args.book ? [args.book] : books;
const failed: string[] = [];
for (const book of selected) {
	// This process's own bun, so a missing `bun` on PATH cannot skip a book.
	const result = spawnSync(
		process.execPath,
		[
			join(repoRoot(), "scripts", "validate-book.ts"),
			"--book",
			book,
			...forwarded,
		],
		{ cwd: repoRoot(), stdio: "inherit" },
	);
	if (result.status !== 0) failed.push(book);
}

// --json's object is the whole output; a summary line would break it.
if (!args.json) {
	console.log(
		failed.length > 0
			? `\n✗ ${failed.length} of ${selected.length} books failed validation: ${failed.join(", ")}`
			: `\n✓ ${selected.length} book${selected.length === 1 ? "" : "s"} validated with no errors`,
	);
}
process.exit(failed.length > 0 ? 1 : 0);
