import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { listBookDirs, repoRoot, requireArg } from "./_lib";
import { applyImport, planImport } from "./lib/import-markdown";
import {
	compileFailures,
	describeImport,
	nextSteps,
} from "./lib/import-report";

/**
 * Imports a folder of Markdown notes into a book's chapters.
 *
 *   bun run bookkit import <book> --dir <folder> [--dry-run] [--force] [--include-readme]
 *
 * --dry-run         print what the import would do; write nothing
 * --force           also replace chapters and images edited since import
 * --include-readme  import README/index files as chapters (skipped by default)
 */

const book = requireArg("--book");
const sourceArg = requireArg("--dir");
const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");
const includeReadme = process.argv.includes("--include-readme");

const workspaceRoot = repoRoot();
const bookDir = `apps/${book}`;
const sourceDir = resolve(sourceArg);
// In this repo the bookkit CLI runs every command; a project made by
// create-bookkit has package scripts instead.
const inRepo = existsSync(join(workspaceRoot, "scripts", "bookkit.ts"));

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
