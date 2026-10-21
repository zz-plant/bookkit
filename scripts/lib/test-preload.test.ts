import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runChild, waitForChildren } from "./child-process.fixture";

/**
 * The preload's guard on apps/: `bun test`, in a copy of the repository's
 * test setup (bunfig.toml and this preload) holding one book, fails when a
 * test file creates or deletes anything there, and names it.
 */

waitForChildren();

let repo: string;

const write = (path: string, text: string) => {
	mkdirSync(join(repo, path, ".."), { recursive: true });
	writeFileSync(join(repo, path), text);
};

/** A test file that runs `body` (with node:fs's functions in scope) once. */
const testFile = (name: string, body: string) =>
	write(
		`${name}.test.ts`,
		`import { it } from "bun:test";\nimport { mkdirSync, rmSync, writeFileSync } from "node:fs";\nit("${name}", () => {\n${body}\n});\n`,
	);

/** `bun test` over `files`, as `bun run test` runs it unless `serial`. */
const bunTest = (files: string[], serial = false) => {
	const env = { ...process.env };
	// This file's own worker id would tell the inner run it is a worker.
	delete env.BUN_TEST_WORKER_ID;
	delete env.JEST_WORKER_ID;
	return runChild(
		[
			process.execPath,
			"test",
			...(serial ? [] : ["--parallel"]),
			...files.map((file) => `./${file}.test.ts`),
		],
		{ cwd: repo, env },
	);
};

beforeEach(() => {
	repo = realpathSync(mkdtempSync(join(tmpdir(), "bookkit-preload-")));
	copyFileSync(
		join(import.meta.dir, "..", "..", "bunfig.toml"),
		join(repo, "bunfig.toml"),
	);
	mkdirSync(join(repo, "scripts", "lib"), { recursive: true });
	copyFileSync(
		join(import.meta.dir, "test-preload.ts"),
		join(repo, "scripts", "lib", "test-preload.ts"),
	);
	write("apps/on-call/src/content/book/chapters/01-a.mdx", "# A\n");
	write("apps/on-call/package.json", "{}\n");
	testFile("quiet", "");
});

afterEach(() => {
	rmSync(repo, { recursive: true, force: true });
});

describe("the test preload", () => {
	it("passes a run whose tests leave apps/ alone", () => {
		const run = bunTest(["quiet"]);
		expect(run.output).toContain(" 0 fail");
		expect(run.status).toBe(0);
	});

	it("fails the run when a test file creates a book in apps/, and names the file and the folder", () => {
		testFile(
			"strays",
			'mkdirSync("apps/links-book/src", { recursive: true });\nwriteFileSync("apps/links-book/package.json", "{}");',
		);
		const run = bunTest(["strays"]);
		expect(run.status).toBe(1);
		expect(run.output).toContain(
			"A test changed the repository's apps/ while strays.test.ts ran (or a test file running beside it):\n  created apps/links-book\nTests must make and remove books in a scratch workspace",
		);
	});

	it("fails the run when a test file deletes a book's file or the book", () => {
		testFile(
			"deletes",
			'rmSync("apps/on-call/src/content/book/chapters/01-a.mdx");',
		);
		const deleted = bunTest(["deletes"]);
		expect(deleted.status).toBe(1);
		expect(deleted.output).toContain(
			"  deleted apps/on-call/src/content/book/chapters/01-a.mdx\n",
		);

		testFile("removes", 'rmSync("apps/on-call", { recursive: true });');
		write("apps/on-call/src/content/book/chapters/01-a.mdx", "# A\n");
		const removed = bunTest(["removes"]);
		expect(removed.status).toBe(1);
		expect(removed.output).toContain("  deleted apps/on-call\nTests must");
	});

	it("says it was during the run when the files share one process", () => {
		testFile("strays", 'mkdirSync("apps/links-book");');
		const run = bunTest(["quiet", "strays"], true);
		expect(run.status).toBe(1);
		expect(run.output).toContain(
			"A test changed the repository's apps/ during this test run:\n  created apps/links-book\n",
		);
	});

	it("leaves out what builds, dev servers, exports and proposals write", () => {
		testFile(
			"builds",
			[
				"apps/on-call/dist/index.html",
				"apps/on-call/.astro/types.d.ts",
				"apps/on-call/.bookkit/reader-analytics.jsonl",
				"apps/on-call/node_modules/.vite/deps.json",
				"apps/on-call/exports/gitbook/README.md",
				"apps/on-call/proposals/draft.md",
				"apps/on-call/src/.DS_Store",
			]
				.map(
					(path) =>
						`mkdirSync(${JSON.stringify(join(path, ".."))}, { recursive: true });\nwriteFileSync(${JSON.stringify(path)}, "");`,
				)
				.join("\n"),
		);
		const run = bunTest(["builds"]);
		expect(run.output).toContain(" 0 fail");
		expect(run.status).toBe(0);
	});
});
