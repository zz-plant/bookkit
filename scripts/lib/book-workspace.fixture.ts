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
	insideScratchWorkspace,
	SCRATCH_WORKSPACE_MARKER,
} from "../../packages/astro-bookkit/src/utils/scratch-workspace";
import {
	BUILD_DEADLINE_MS,
	CHILD_DEADLINE_MS,
	runChild,
	SCRATCH_WORKSPACES,
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
 *
 * Inside the repo, a script that walked up from a deleted workspace would
 * reach the repo's own apps/. So each workspace holds a marker file, every
 * path these helpers hand out is checked to be inside a workspace that still
 * has it, and each child started in one is told its folder, outside which
 * its scripts resolve nothing (utils/scratch-workspace.ts, `childEnv`).
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
	mkdirSync(SCRATCH_WORKSPACES, { recursive: true });
	const workspace = mkdtempSync(join(SCRATCH_WORKSPACES, prefix));
	writeFileSync(
		join(workspace, SCRATCH_WORKSPACE_MARKER),
		"A test's scratch workspace (scripts/lib/book-workspace.fixture.ts).\n",
	);
	// The engine, its starter template, and dependencies come from this repo.
	for (const entry of [
		"packages",
		"node_modules",
		"tsconfig.base.json",
		"biome.json",
	]) {
		symlinkSync(join(REPO, entry), insideScratchWorkspace(workspace, entry));
	}
	writeFileSync(
		insideScratchWorkspace(workspace, ".gitignore"),
		"node_modules/\ndist/\n.astro/\n",
	);
	// A workspace root has one; the MCP route lists its scripts.
	writeFileSync(
		insideScratchWorkspace(workspace, "package.json"),
		'{ "name": "bookkit-scratch-workspace", "private": true }\n',
	);
	return workspace;
};

/**
 * Turns off link-preview images in a new book's Astro config: they take
 * seconds and are not what these tests are about. Throws, rather than leave
 * them on, if the starter's call is neither `bookkit()` nor
 * `bookkit({ ... })`.
 */
const withoutLinkPreviews = (config: string) => {
	const source = readFileSync(config, "utf8");
	// The first call on a line that is not a comment: the starter's comments
	// name bookkit() too.
	const call = /^((?:(?!\/\/).)*?)\bbookkit\((\s*\{|\s*(?=\)))/m;
	if (!call.test(source)) {
		throw new Error(
			`Could not turn off link-preview images in ${config}: its bookkit call is neither bookkit() nor bookkit({ ... }). Update withoutLinkPreviews in scripts/lib/book-workspace.fixture.ts.`,
		);
	}
	writeFileSync(
		config,
		source.replace(
			call,
			(_, before: string, opening: string) =>
				`${before}bookkit({ ogImages: false${opening.trim() ? "," : " }"}`,
		),
	);
};

/**
 * A scratch workspace holding a new book made by `new:book`, with
 * link-preview images off unless `linkPreviews` (check:build fails a build
 * whose pages name images it did not draw).
 */
export const createBookWorkspace = (
	prefix: string,
	book: string,
	{ linkPreviews = false } = {},
): { workspace: string; appDir: string } => {
	const workspace = emptyWorkspace(prefix);
	// --no-install: the workspace borrows this repository's node_modules.
	const scaffold = runBun(
		[join(REPO, "scripts", "scaffold-book.ts"), "--book", book, "--no-install"],
		workspace,
	);
	if (scaffold.exitCode !== 0) throw new Error(scaffold.output);
	const appDir = insideScratchWorkspace(workspace, "apps", book);
	if (!linkPreviews) withoutLinkPreviews(join(appDir, "astro.config.mjs"));
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
	const appDir = (book: string) =>
		insideScratchWorkspace(workspace, "apps", book);
	for (const book of books) {
		const from = join(REPO, "apps", book);
		cpSync(from, appDir(book), {
			recursive: true,
			filter: (source) => !GENERATED.has(relative(from, source)),
		});
	}
	return { workspace, appDir };
};
