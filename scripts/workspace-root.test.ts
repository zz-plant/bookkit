import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoRoot } from "./_lib";

/**
 * `bun run <script>` keeps the caller's directory. Scripts started from inside
 * the workspace find it; started outside one, a check that reads nothing fails
 * instead of passing.
 */

const root = repoRoot();
let outside: string;

const run = (script: string, cwd: string) => {
	const result = Bun.spawnSync(
		[process.execPath, join(root, "scripts", script)],
		{ cwd, stdout: "pipe", stderr: "pipe" },
	);
	return {
		status: result.exitCode,
		output: `${result.stdout.toString()}${result.stderr.toString()}`,
	};
};

beforeAll(() => {
	outside = mkdtempSync(join(tmpdir(), "bookkit-outside-"));
});

afterAll(() => {
	rmSync(outside, { recursive: true, force: true });
});

describe("scripts run from a subdirectory", () => {
	it("see every book", () => {
		const fromRoot = run("list-books.ts", root).output;
		expect(fromRoot.trim().split("\n").length).toBeGreaterThan(0);
		for (const dir of ["scripts", "docs", join("apps", "on-call", "src")]) {
			expect(run("list-books.ts", join(root, dir)).output).toBe(fromRoot);
		}
	});

	it("check what they say they checked", () => {
		const separation = run("check-separation.ts", join(root, "docs"));
		expect(separation.status).toBe(0);
		expect(separation.output).toMatch(
			/passed: [1-9]\d* content files in [1-9]\d* books/,
		);
		const todos = run("check-todos.ts", join(root, "scripts"));
		expect(todos.status).toBe(0);
		expect(todos.output).toMatch(/passed \([1-9]\d* trackers?\)/);
	});
});

describe("scripts run outside any workspace", () => {
	it("fail instead of passing after reading nothing", () => {
		const separation = run("check-separation.ts", outside);
		expect(separation.status).toBe(1);
		expect(separation.output).toContain("read no content files");
		const todos = run("check-todos.ts", outside);
		expect(todos.status).toBe(1);
		expect(todos.output).toContain("found no books");
	});
});
