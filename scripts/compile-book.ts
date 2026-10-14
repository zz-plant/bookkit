import { spawnSync } from "node:child_process";
import { listBookDirs } from "./_lib";
import { parseScriptArgs } from "./lib/cli";

const args = parseScriptArgs(
	`Compile a book: validate it, build it, and optionally export it.

Usage:
  bun run compile:book -- --book <slug> [options]

Options:
  --book <slug>         The book to compile
  --skip-validate       Skip validation
  --export <target>     Also export it (gitbook)
  --create-if-missing   Scaffold the book first if it does not exist
  --title <value>       Title for --create-if-missing (default: from the slug)
  -h, --help            Show this help

Validation applies the rules the book's status sets: release rules for a
published or stable book. Errors stop the compile. (--mode and --no-drafts
are accepted for older callers and ignored.)`,
	{
		book: "string",
		"skip-validate": "boolean",
		export: "string",
		"create-if-missing": "boolean",
		title: "string",
		mode: "string",
		"no-drafts": "boolean",
	},
	["book"],
);

const { book } = args;
const skipValidate = args["skip-validate"] === true;
const exportTarget = args.export;
const createIfMissing = args["create-if-missing"] === true;
const titleArg = args.title;

const books = listBookDirs();
const hasBook = books.includes(book);

if (!hasBook && !createIfMissing) {
	console.error(`Unknown book: ${book}`);
	console.error("Available books:");
	for (const entry of books) console.error(`- ${entry}`);
	console.error(
		"\nTip: pass --create-if-missing to scaffold automatically before compile.",
	);
	process.exit(1);
}

if (!hasBook && createIfMissing) {
	const inferredTitle =
		titleArg ??
		book
			.split("-")
			.map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
			.join(" ");

	runStep("scaffold", [
		"run",
		"new:book",
		"--",
		"--book",
		book,
		"--title",
		inferredTitle,
	]);
}

if (!skipValidate) {
	runStep("validate", ["run", "--filter", `@books/${book}`, "validate"]);
}

runStep("build", ["run", "--filter", `@books/${book}`, "build"]);

if (exportTarget) {
	if (exportTarget !== "gitbook") {
		console.error(`Unknown export target: ${exportTarget}`);
		console.error("Supported targets: gitbook");
		process.exit(1);
	}
	runStep("export", ["run", "export:gitbook", "--", "--book", book]);
}

function runStep(label: string, args: string[]) {
	console.log(`\n[bookkit] ${label}`);
	// This process's own bun, so a missing `bun` on PATH cannot skip a step.
	const res = spawnSync(process.execPath, args, { stdio: "inherit" });
	if (res.status !== 0) {
		console.error(`\n[bookkit] ${label} failed`);
		process.exit(res.status ?? 1);
	}
}
