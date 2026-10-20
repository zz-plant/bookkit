import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";

/**
 * A scratch workspace holding one new book, made by `new:book` from this
 * repo's engine and node_modules, for tests that build a book without
 * touching apps/.
 *
 * The workspace sits inside the repo (in gitignored .test-workspaces/), not
 * the OS temp dir: Vite resolves the borrowed engine to its real path, and
 * Astro reads an absolute path that shares no directory with the app as
 * relative to the app, so a book under /tmp cannot find the engine's
 * components. The caller removes `workspace` when done.
 */

const REPO = join(import.meta.dir, "..", "..");

/** Runs `bun <args>` in `cwd`; the output is stdout and stderr together. */
export const runBun = (args: string[], cwd: string) => {
	const result = Bun.spawnSync([process.execPath, ...args], {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		exitCode: result.exitCode,
		output: `${result.stdout.toString()}${result.stderr.toString()}`,
	};
};

export const createBookWorkspace = (
	prefix: string,
	book: string,
): { workspace: string; appDir: string } => {
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
