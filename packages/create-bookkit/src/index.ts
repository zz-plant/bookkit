#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { parseCreateArgs, USAGE } from "./args";

const DEFAULT_REPO_URL = "https://github.com/zz-plant/bookkit.git";
const localRoot = resolve(import.meta.dir, "../../..");

const hasRepoSource = (root: string) =>
	existsSync(join(root, "scripts", "bookkit.ts")) &&
	existsSync(join(root, "packages", "astro-bookkit", "package.json"));

const slugify = (text: string): string =>
	text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

const titleFromSlug = (slug: string): string =>
	slug
		.split("-")
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");

const fail = (message: string): never => {
	console.error(message);
	process.exit(1);
};

const parsed = parseCreateArgs(process.argv.slice(2));
if ("help" in parsed) {
	console.log(USAGE);
	process.exit(0);
}
if ("error" in parsed) fail(`${parsed.error}\n\n${USAGE}`);
const args = (parsed as Extract<typeof parsed, { values: unknown }>).values;
const target = resolve(args.target);

const sourceRoot = args.source ? resolve(args.source) : localRoot;
if (args.source && !hasRepoSource(sourceRoot)) {
	fail(
		`Source directory ${sourceRoot} is not a bookkit repository checkout (missing scripts/bookkit.ts or packages/astro-bookkit/package.json).`,
	);
}

// When invoked outside a repository clone (e.g. via `bunx create-bookkit`) or with --ref,
// shallow-clone the Bookkit repository into a temp dir and delegate to its scaffolder.
if (args.ref || !hasRepoSource(sourceRoot)) {
	const cloneDir = mkdtempSync(join(tmpdir(), "bookkit-source-"));
	try {
		const repoUrl = process.env.BOOKKIT_REPO_URL || DEFAULT_REPO_URL;
		const cloneArgs = ["clone", "--depth", "1", "--quiet"];
		if (args.ref) cloneArgs.push("--branch", args.ref);
		cloneArgs.push(repoUrl, cloneDir);
		console.log(
			`Fetching Bookkit engine source from ${repoUrl}${args.ref ? ` (${args.ref})` : ""}...`,
		);
		const clone = spawnSync("git", cloneArgs, { stdio: "inherit" });
		if (clone.status !== 0) {
			fail(
				`git clone exited with status ${clone.status}. Check network access or pass --source <local-bookkit-repo>.`,
			);
		}
		const forwarded = [
			join(cloneDir, "packages", "create-bookkit", "src", "index.ts"),
			target,
			"--source",
			cloneDir,
		];
		if (args.book) forwarded.push("--book", args.book);
		if (args.title) forwarded.push("--title", args.title);
		if (args.dir) forwarded.push("--dir", resolve(args.dir));
		if (args.force) forwarded.push("--force");
		if (args.upgrade) forwarded.push("--upgrade");
		const delegated = spawnSync(process.execPath, ["run", ...forwarded], {
			stdio: "inherit",
		});
		process.exit(delegated.status ?? 1);
	} finally {
		rmSync(cloneDir, { recursive: true, force: true });
	}
}

// If --source points at another checkout, delegate so `./project` imports that checkout's `scripts/`.
if (sourceRoot !== localRoot) {
	const forwarded = [
		join(sourceRoot, "packages", "create-bookkit", "src", "index.ts"),
		target,
		"--source",
		sourceRoot,
	];
	if (args.book) forwarded.push("--book", args.book);
	if (args.title) forwarded.push("--title", args.title);
	if (args.dir) forwarded.push("--dir", resolve(args.dir));
	if (args.force) forwarded.push("--force");
	if (args.upgrade) forwarded.push("--upgrade");
	const delegated = spawnSync(process.execPath, ["run", ...forwarded], {
		stdio: "inherit",
	});
	process.exit(delegated.status ?? 1);
}

const {
	createConflicts,
	createProject,
	isBookkitProject,
	isBookkitRepository,
	isInside,
	nextSteps,
	readSource,
	summarizeUpgrade,
	upgradeProject,
} = await import("./project");

if (isInside(target, sourceRoot)) {
	fail(
		`${target} is inside the bookkit repository (${sourceRoot}). Pick a folder outside it, e.g. ../${basename(target)}: a project inside would be read as part of this workspace.`,
	);
}

if (args.upgrade) {
	if (!existsSync(target) || !isBookkitProject(target)) {
		fail(
			`${target} is not a Bookkit project: it has no packages/astro-bookkit/ engine and apps/ folder. Nothing was changed. To create one there, leave out --upgrade.`,
		);
	}
	if (isBookkitRepository(target)) {
		fail(
			`${target} is a bookkit repository, not a project made from one. Update it with git.`,
		);
	}
	const result = upgradeProject(readSource(sourceRoot), target);
	for (const line of summarizeUpgrade(result)) console.log(line);
	console.log(`
Not touched: book content (apps/*/src/content/), book.config.ts, each book's own
pages, README.md, and anything else the scaffolder does not own.
Next:
  cd ${target}
  bun install
  bun run verify -- --all`);
	process.exit(0);
}

const book = args.book ?? slugify(basename(target));
if (!book) {
	fail(
		`Cannot make a book slug from the folder name "${basename(target)}". Pass --book <slug>.`,
	);
}
const title = args.title ?? titleFromSlug(book);

if (existsSync(target) && isBookkitProject(target)) {
	fail(
		`${target} is already a Bookkit project. To update its engine and wrappers, run with --upgrade; that never writes content.`,
	);
}
const entries = existsSync(target)
	? readdirSync(target).filter((name) => ![".git", ".DS_Store"].includes(name))
	: [];
if (entries.length > 0 && !args.force) {
	fail(
		`${target} is not empty (${entries.slice(0, 5).join(", ")}${entries.length > 5 ? ", …" : ""}). Use an empty folder, or pass --force to add the project beside those files; --force never overwrites one.`,
	);
}

const source = readSource(sourceRoot);
const conflicts = createConflicts(source, target, book);
if (conflicts.length > 0) {
	fail(
		`These already exist in ${target}, and the project would overwrite them:\n  ${conflicts.join("\n  ")}\nNothing was written. Move them, or pick another folder.`,
	);
}

let markdownSource: string | undefined;
if (args.dir) {
	markdownSource = resolve(args.dir);
	if (!existsSync(markdownSource)) {
		fail(`Markdown folder not found: ${markdownSource}. Nothing was written.`);
	}
}

mkdirSync(target, { recursive: true });
const created = createProject(source, target, { book, title });
console.log(
	`Created ${target}: book "${book}", engine ${source.engineVersion}${source.commit ? ` (${source.commit})` : ""}, ${created.files} files.`,
);
if (created.keptExisting.length > 0) {
	console.log(`Kept your existing ${created.keptExisting.join(" and ")}.`);
}

// Import reads frontmatter with the project's own dependencies, so the
// project is installed first.
let installed = false;
if (markdownSource) {
	console.log("Installing dependencies (bun install)...");
	const install = spawnSync(process.execPath, ["install"], {
		cwd: target,
		stdio: "inherit",
	});
	if (install.status !== 0) {
		fail(
			`bun install exited with status ${install.status}. Run it in ${target}, then: bun run import --book ${book} --dir ${markdownSource}`,
		);
	}
	installed = true;
	console.log(`Importing chapters from ${markdownSource}...`);
	const run = spawnSync(
		process.execPath,
		[
			"run",
			"scripts/import-book-from-markdown.ts",
			"--book",
			book,
			"--dir",
			markdownSource,
		],
		{ cwd: target, stdio: "inherit" },
	);
	if (run.status !== 0) fail(`Import exited with status ${run.status}.`);
}

console.log(nextSteps(target, { installed, book }));
