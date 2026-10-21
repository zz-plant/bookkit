import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
	buildBook,
	createBookWorkspace,
	runBun as run,
} from "./book-workspace.fixture";

/**
 * `fixtures/import-notes`, imported by the import command into a new book,
 * builds with Astro. The book lives in a scratch workspace that borrows this
 * repo's node_modules, so nothing under apps/ changes.
 */

const REPO = join(import.meta.dir, "..", "..");
const FIXTURE = join(import.meta.dir, "fixtures", "import-notes");
const BOOK = "notes-book";

let workspace: string;
let appDir: string;

beforeAll(() => {
	({ workspace, appDir } = createBookWorkspace("import-build-", BOOK));
});

afterAll(() => rmSync(workspace, { recursive: true, force: true }));

describe("bookkit import, then build", () => {
	it("imports the notes and the book builds", () => {
		const imported = run(
			[
				join(REPO, "scripts", "import-book-from-markdown.ts"),
				"--book",
				BOOK,
				"--dir",
				FIXTURE,
			],
			workspace,
		);
		expect(imported.output).toContain("Chapters, in reading order (7):");
		expect(imported.exitCode).toBe(0);

		const build = buildBook(appDir);
		if (build.exitCode !== 0) console.error(build.output);
		expect(build.exitCode).toBe(0);
		// createBookWorkspace turns link-preview images off.
		expect(build.output).not.toContain("link-preview images");
		expect(existsSync(join(appDir, "dist", "og"))).toBe(false);

		const page = (slug: string) =>
			readFileSync(
				join(appDir, "dist", "read", "chapters", slug, "index.html"),
				"utf8",
			);
		const why = page("why-handoffs-fail");
		expect(why).toContain("<title>Why handoffs fail");
		expect(why).toContain('href="/read/chapters/handoff-checklist"');
		expect(why).toContain(
			'href="/read/chapters/context-glossary#context-debt"',
		);
		expect(why).toContain('src="/images/handoff-board.png"');
		expect(why).toContain("&lt;on-call-lead&gt;");
		expect(why).toContain("{nothing}");
		expect(why).not.toContain(workspace);
		expect(
			existsSync(join(appDir, "dist", "images", "handoff-board.png")),
		).toBe(true);
		expect(page("context-glossary")).toContain('id="context-debt"');
		expect(page("retro-notes")).toMatch(
			/<details><summary>Timeline<\/summary>\s*<ul>/,
		);
		expect(page("unfinished")).toContain("<title>Unfinished thought");
		expect(existsSync(join(appDir, "dist", "read", "chapters", "readme"))).toBe(
			false,
		);
	}, 240_000);
});
