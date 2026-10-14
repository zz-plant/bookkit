import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	copyFileSync,
	cpSync,
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

const run = (args: string[], cwd: string) => {
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

beforeAll(() => {
	workspace = mkdtempSync(join(tmpdir(), "bookkit-import-build-"));
	// The engine, its shim templates, and dependencies come from this repo.
	for (const dir of ["node_modules", "packages"]) {
		symlinkSync(join(REPO, dir), join(workspace, dir));
	}
	copyFileSync(
		join(REPO, "tsconfig.base.json"),
		join(workspace, "tsconfig.base.json"),
	);
	// new-book copies apps/bad-people; give it one to copy.
	cpSync(
		join(REPO, "apps", "bad-people"),
		join(workspace, "apps", "bad-people"),
		{
			recursive: true,
			filter: (source) =>
				!/(^|[\\/])(node_modules|dist|\.astro)([\\/]|$)/.test(source),
		},
	);
	const scaffold = run(
		[join(REPO, "scripts", "scaffold-book.ts"), "--book", BOOK],
		workspace,
	);
	if (scaffold.exitCode !== 0) throw new Error(scaffold.output);
	rmSync(join(workspace, "apps", "bad-people"), { recursive: true });
	appDir = join(workspace, "apps", BOOK);
	// Link-preview images take seconds and are not what this test is about.
	const config = join(appDir, "astro.config.mjs");
	writeFileSync(
		config,
		readFileSync(config, "utf8").replace(
			"bookkit()",
			"bookkit({ ogImages: false })",
		),
	);
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

		const build = run(["run", "build"], appDir);
		if (build.exitCode !== 0) console.error(build.output);
		expect(build.exitCode).toBe(0);

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
