import { afterAll, describe, expect, it } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { SCRATCH_WORKSPACE_MARKER } from "../../packages/astro-bookkit/src/utils/scratch-workspace";
import {
	copyBooks,
	createBookWorkspace,
	runBun,
} from "./book-workspace.fixture";
import { SCRATCH_WORKSPACES, waitForChildren } from "./child-process.fixture";

/**
 * The scratch workspaces tests build books in: marked, handing out only
 * paths inside themselves, and starting no child once the marker is gone.
 */

waitForChildren();

const LIB = join(import.meta.dir, "..", "_lib.ts");
const made: string[] = [];

afterAll(() => {
	for (const workspace of made) {
		rmSync(workspace, { recursive: true, force: true });
	}
});

const emptyWorkspace = () => {
	const { workspace, appDir } = copyBooks("fixture-guard-", []);
	made.push(workspace);
	return { workspace, appDir };
};

/** What `repoRoot()` answers in a child started in `cwd`. */
const childRepoRoot = (cwd: string) =>
	runBun(
		["-e", `console.log(require(${JSON.stringify(LIB)}).repoRoot())`],
		cwd,
	);

describe("a scratch workspace", () => {
	it("is marked, sits in .test-workspaces/, and is the root its children's scripts see", () => {
		const { workspace, appDir } = emptyWorkspace();
		expect(workspace.startsWith(`${SCRATCH_WORKSPACES}/fixture-guard-`)).toBe(
			true,
		);
		expect(existsSync(join(workspace, SCRATCH_WORKSPACE_MARKER))).toBe(true);
		expect(appDir("probe")).toBe(join(workspace, "apps", "probe"));
		const seen = childRepoRoot(workspace);
		expect(seen.output.trim()).toBe(workspace);
		expect(seen.exitCode).toBe(0);
	});

	it("hands out no path and starts no child once its marker is gone", () => {
		const { workspace, appDir } = emptyWorkspace();
		rmSync(join(workspace, SCRATCH_WORKSPACE_MARKER));
		expect(() => appDir("probe")).toThrow(
			`has no ${SCRATCH_WORKSPACE_MARKER}: it was deleted while a test used it.`,
		);
		const wrote = join(workspace, "child-ran");
		expect(() =>
			runBun(
				[
					"-e",
					`require("node:fs").writeFileSync(${JSON.stringify(wrote)}, "")`,
				],
				workspace,
			),
		).toThrow("it was deleted while a test used it");
		expect(existsSync(wrote)).toBe(false);
	});

	it("hands out no path outside itself", () => {
		const { appDir } = emptyWorkspace();
		expect(() => appDir(join("..", "..", "..", "apps", "on-call"))).toThrow(
			"is outside the scratch workspace",
		);
	});

	it("holds a new book with link-preview images turned off", () => {
		const { workspace, appDir } = createBookWorkspace("fixture-og-", "og-off");
		made.push(workspace);
		expect(readFileSync(join(appDir, "astro.config.mjs"), "utf8")).toMatch(
			/\bbookkit\(\{ ogImages: false,/,
		);
	});
});
