import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import {
	BUILD_DEADLINE_MS,
	CHILD_DEADLINE_MS,
	runChild,
} from "./child-process.fixture";

/**
 * Scratch workspaces for tests that build a book without touching apps/:
 * one holding a new book made by `new:book`, or one holding copies of this
 * repo's books. Each borrows this repo's engine and node_modules.
 *
 * A workspace sits inside the repo (in gitignored .test-workspaces/), not
 * the OS temp dir: Vite resolves the borrowed engine to its real path, and
 * Astro reads an absolute path that shares no directory with the app as
 * relative to the app, so a book under /tmp cannot find the engine's
 * components. The caller removes `workspace` when done.
 */

const REPO = join(import.meta.dir, "..", "..");

/** Runs `bun <args>` in `cwd`; the output is stdout and stderr together. */
export const runBun = (
	args: string[],
	cwd: string,
	deadlineMs = CHILD_DEADLINE_MS,
) => {
	const result = runChild([process.execPath, ...args], { cwd, deadlineMs });
	return { exitCode: result.status, output: result.output };
};

/** `bun run build` in the book's folder, with a build's deadline. */
export const buildBook = (appDir: string) =>
	runBun(["run", "build"], appDir, BUILD_DEADLINE_MS);

const emptyWorkspace = (prefix: string) => {
	const scratch = join(REPO, ".test-workspaces");
	mkdirSync(scratch, { recursive: true });
	const workspace = mkdtempSync(join(scratch, prefix));
	// The engine, its starter template, and dependencies come from this repo.
	for (const entry of [
		"packages",
		"node_modules",
		"tsconfig.base.json",
		"biome.json",
	]) {
		symlinkSync(join(REPO, entry), join(workspace, entry));
	}
	writeFileSync(
		join(workspace, ".gitignore"),
		"node_modules/\ndist/\n.astro/\n",
	);
	return workspace;
};

export const createBookWorkspace = (
	prefix: string,
	book: string,
): { workspace: string; appDir: string } => {
	const workspace = emptyWorkspace(prefix);
	// --no-install: the workspace borrows this repository's node_modules.
	const scaffold = runBun(
		[join(REPO, "scripts", "scaffold-book.ts"), "--book", book, "--no-install"],
		workspace,
	);
	if (scaffold.exitCode !== 0) throw new Error(scaffold.output);
	const appDir = join(workspace, "apps", book);
	// Link-preview images take seconds and are not what these tests are about.
	const config = join(appDir, "astro.config.mjs");
	writeFileSync(
		config,
		readFileSync(config, "utf8").replace(
			"bookkit()",
			"bookkit({ ogImages: false })",
		),
	);
	return { workspace, appDir };
};

/** What a build or a dev server writes at the top of a book's folder. */
const GENERATED = new Set(["node_modules", "dist", ".astro", ".bookkit"]);

/**
 * Copies of this repo's books, to build. Two Astro processes
 * building one book folder share its .astro/ and node_modules/ caches, and
 * test files run in parallel, so a test that builds apps/<book> in place can
 * break another test's build of the same book.
 */
export const copyBooks = (
	prefix: string,
	books: readonly string[],
): { workspace: string; appDir: (book: string) => string } => {
	const workspace = emptyWorkspace(prefix);
	const appDir = (book: string) => join(workspace, "apps", book);
	for (const book of books) {
		const from = join(REPO, "apps", book);
		cpSync(from, appDir(book), {
			recursive: true,
			filter: (source) => !GENERATED.has(relative(from, source)),
		});
	}
	return { workspace, appDir };
};
