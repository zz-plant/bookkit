import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { listBookDirs, listFilesRecursive, repoRoot } from "./_lib";
import { isInteractive, parseScriptArgs, requireExistingBook } from "./lib/cli";

const args = parseScriptArgs(
	`Delete a book app (apps/<book>) and everything in it.

Usage:
  bun run remove:book -- --book <book> [--dry-run] [--yes] [--force]

Options:
  --book <book>   The book's exact folder name under apps/
  --dry-run       Show what would be deleted; delete nothing
  --yes           Delete without asking (for scripts and agents)
  --force         Delete even with uncommitted changes in the book
  -h, --help      Show this help`,
	{ book: "string", "dry-run": "boolean", yes: "boolean", force: "boolean" },
	["book"],
);

const root = repoRoot();
const { book } = args;
// An exact name only: "On Call" must not resolve to on-call.
requireExistingBook(book, listBookDirs());

const appDir = join(root, "apps", book);
const generated = /(^|\/)(node_modules|dist|\.astro)\//;
const files = listFilesRecursive(appDir).filter(
	(file) => !generated.test(file),
);
const count = (section: string) =>
	files.filter((file) => file.startsWith(`src/content/book/${section}/`))
		.length;

console.log(
	`apps/${book}: ${files.length} files (${count("chapters")} chapters, ${count("mechanisms")} mechanisms, ${count("toolkit")} tools, ${count("examples")} examples), plus any build output.`,
);

const status = spawnSync(
	"git",
	["status", "--porcelain", "--untracked-files=all", "--", `apps/${book}`],
	{ cwd: root, encoding: "utf8" },
);
const uncommitted =
	status.status === 0 ? status.stdout.split("\n").filter(Boolean) : [];
if (uncommitted.length > 0) {
	console.log(`Uncommitted changes in apps/${book}:`);
	for (const line of uncommitted.slice(0, 10)) console.log(`  ${line}`);
	if (uncommitted.length > 10)
		console.log(`  … and ${uncommitted.length - 10} more`);
	if (!args.force && !args["dry-run"]) {
		console.error(
			"Refusing to delete: those changes exist nowhere else. Commit or move them, or pass --force to delete them too.",
		);
		process.exit(1);
	}
}

if (args["dry-run"]) {
	console.log(`Dry run: nothing deleted.`);
	process.exit(0);
}

if (!args.yes) {
	if (!isInteractive()) {
		console.error(
			`Not deleting without confirmation. Pass --yes to delete apps/${book}.`,
		);
		process.exit(1);
	}
	const answer = prompt(`Delete apps/${book}? Type the book name to confirm:`);
	if (answer?.trim() !== book) {
		console.log("Nothing deleted.");
		process.exit(1);
	}
}

rmSync(appDir, { recursive: true, force: true });
console.log(`Deleted apps/${book}.`);

const corpusPath = join(root, "corpus.json");
if (existsSync(corpusPath)) {
	try {
		const corpus = JSON.parse(readFileSync(corpusPath, "utf8")) as {
			books?: string[];
		};
		if (corpus.books?.includes(book)) {
			console.log(
				`corpus.json still lists "${book}" under books; remove it there.`,
			);
		}
	} catch {
		// check:corpus reports an unreadable corpus.json.
	}
}
