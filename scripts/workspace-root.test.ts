import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	SCRATCH_WORKSPACE_ENV,
	SCRATCH_WORKSPACE_MARKER,
} from "../packages/astro-bookkit/src/utils/scratch-workspace";
import { repoRoot } from "./_lib";
import { runChild, waitForChildren } from "./lib/child-process.fixture";

/**
 * `bun run <script>` keeps the caller's directory. Scripts started from inside
 * the workspace find it; started outside one, a check that reads nothing fails
 * instead of passing.
 */

const root = repoRoot();
let outside: string;

waitForChildren();

const run = (script: string, cwd: string) =>
	runChild([process.execPath, join(root, "scripts", script)], { cwd });

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

describe("a script whose scratch workspace is deleted while it runs", () => {
	// A repository holding one book, with a scratch workspace inside it, as
	// book-workspace.fixture.ts lays them out.
	let repo: string;
	let workspace: string;

	beforeEach(() => {
		repo = realpathSync(mkdtempSync(join(tmpdir(), "bookkit-around-")));
		mkdirSync(join(repo, "apps", "real-book"), { recursive: true });
		workspace = join(repo, ".test-workspaces", "probe-abc");
		mkdirSync(workspace, { recursive: true });
		for (const entry of ["packages", "node_modules"]) {
			symlinkSync(join(root, entry), join(repo, entry));
			symlinkSync(join(root, entry), join(workspace, entry));
		}
		writeFileSync(join(workspace, SCRATCH_WORKSPACE_MARKER), "");
		writeFileSync(join(workspace, "tsconfig.base.json"), "{}");
	});

	afterEach(() => {
		rmSync(repo, { recursive: true, force: true });
	});

	/** `new:book stray-book` in the workspace, once `deleted` are gone. */
	const newBookAfterDeleting = (deleted: string[], env?: NodeJS.ProcessEnv) => {
		const wrapper = join(repo, "new-book-after-deleting.ts");
		writeFileSync(
			wrapper,
			[
				'import { rmSync } from "node:fs";',
				`for (const path of ${JSON.stringify(deleted)}) rmSync(path, { recursive: true, force: true });`,
				'process.argv.push("--book", "stray-book", "--no-install");',
				`await import(${JSON.stringify(join(root, "scripts", "scaffold-book.ts"))});`,
			].join("\n"),
		);
		return runChild([process.execPath, wrapper], { cwd: workspace, env });
	};

	it("stops when its folder is gone, instead of adding a book to the repository around it", () => {
		const result = newBookAfterDeleting([workspace]);
		expect(result.output).toContain(
			`The current folder no longer exists: ${workspace}`,
		);
		expect(result.status).not.toBe(0);
		expect(readdirSync(join(repo, "apps"))).toEqual(["real-book"]);
	});

	it("stops when the workspace has lost its marker, though its folder is still there", () => {
		const result = newBookAfterDeleting(
			[
				join(workspace, SCRATCH_WORKSPACE_MARKER),
				join(workspace, "tsconfig.base.json"),
			],
			{ ...process.env, [SCRATCH_WORKSPACE_ENV]: workspace },
		);
		expect(result.output).toContain(
			`The scratch workspace ${workspace} has no ${SCRATCH_WORKSPACE_MARKER}`,
		);
		expect(result.status).not.toBe(0);
		expect(readdirSync(join(repo, "apps"))).toEqual(["real-book"]);
	});

	it("still makes the book inside a workspace that is all there", () => {
		const result = newBookAfterDeleting([], {
			...process.env,
			[SCRATCH_WORKSPACE_ENV]: workspace,
		});
		expect(result.status).toBe(0);
		expect(readdirSync(join(workspace, "apps"))).toEqual(["stray-book"]);
		expect(readdirSync(join(repo, "apps"))).toEqual(["real-book"]);
	});
});
