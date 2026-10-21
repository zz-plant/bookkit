import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { listBookDirs, repoRoot } from "./_lib";
import { parseScriptArgs } from "./lib/cli";
import { applyImport, planImport } from "./lib/import-markdown";
import {
	compileFailures,
	describeImport,
	nextSteps,
} from "./lib/import-report";

const workspaceRoot = repoRoot();
// In this repo the bookkit CLI runs every command; a project made by
// create-bookkit has package scripts instead.
const inRepo = existsSync(join(workspaceRoot, "scripts", "bookkit.ts"));
const command = inRepo
	? "bun run bookkit import <book>"
	: "bun run import --book <book>";
const example = (book: string) =>
	inRepo
		? `bun run bookkit import ${book} --dir ~/notes/runbooks --dry-run`
		: `bun run import --book ${book} --dir ~/notes/runbooks --dry-run`;

const args = parseScriptArgs(
	{
		summary: "Imports a folder of Markdown notes into a book's chapters.",
		usage: [
			`${command} --dir <folder> [--dry-run] [--force] [--include-readme]`,
		],
		options: [
			[
				"--book <book>",
				`The book in apps/ to import into${inRepo ? "\n(bookkit import takes it as the first word)" : ""}`,
			],
			[
				"--dir <folder>",
				"The folder of notes (.md, .mdx, .markdown), read with\nits subfolders",
			],
			["--dry-run", "Print what the import would do, and write nothing"],
			[
				"--force",
				"Also replace chapters and images edited since the last\nimport",
			],
			[
				"--include-readme",
				"Import README and index files as chapters (skipped by\ndefault)",
			],
		],
		examples: [example(listBookDirs()[0] ?? "my-book")],
	},
	{
		book: "string",
		dir: "string",
		"dry-run": "boolean",
		force: "boolean",
		"include-readme": "boolean",
	},
	["book", "dir"],
);

const { book, dir: sourceArg } = args;
const dryRun = args["dry-run"] === true;
const force = args.force === true;
const includeReadme = args["include-readme"] === true;

const bookDir = `apps/${book}`;
const sourceDir = resolve(sourceArg);

if (!existsSync(join(workspaceRoot, bookDir, "src", "content", "book"))) {
	const books = listBookDirs();
	console.error(
		`No book "${book}" under apps/.${books.length > 0 ? ` Books here: ${books.join(", ")}.` : ""}${inRepo ? ` To start one: bun run bookkit new-book --book ${book}` : ""}`,
	);
	process.exit(1);
}
if (!existsSync(sourceDir) || !statSync(sourceDir).isDirectory()) {
	console.error(`Source folder not found: ${sourceArg}`);
	process.exit(1);
}

const plan = await planImport({
	workspaceRoot,
	book,
	sourceDir,
	sourceLabel: sourceArg,
	force,
	includeReadme,
});
if (plan.chapters.length === 0 && plan.skipped.length === 0) {
	console.error(`No Markdown notes (.md, .mdx, .markdown) under ${sourceArg}`);
	process.exit(1);
}
if (!dryRun) await applyImport(plan);

for (const line of describeImport(plan, { dryRun, bookDir })) console.log(line);

for (const line of nextSteps({
	book,
	sourceArg,
	dryRun,
	inRepo,
	force,
	includeReadme,
})) {
	console.log(line);
}

if (compileFailures(plan).length > 0) process.exit(1);
