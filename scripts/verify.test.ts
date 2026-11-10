import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoRoot } from "./_lib";
import { runChild, waitForChildren } from "./lib/child-process.fixture";

/**
 * `verify` where there is no git repository to compare against. The tests of
 * `bookkit` itself are beside its commands, in lib/commands/.
 */

waitForChildren();

describe("verify outside a git repository", () => {
	let workspace: string;

	beforeAll(() => {
		workspace = mkdtempSync(join(tmpdir(), "bookkit-no-git-"));
		mkdirSync(join(workspace, "apps", "a-book"), { recursive: true });
		symlinkSync(
			join(repoRoot(), "node_modules"),
			join(workspace, "node_modules"),
		);
	});

	afterAll(() => {
		rmSync(workspace, { recursive: true, force: true });
	});

	it("says to run every gate with --all, since there is nothing to compare", () => {
		const result = runChild(
			[process.execPath, join(repoRoot(), "scripts", "verify.ts")],
			{ cwd: workspace },
		);
		expect(result.status).toBe(1);
		expect(result.output).toContain(
			"is not in a git repository, so verify cannot tell which files changed. Run every gate instead: bun run verify -- --all",
		);
	});
});
