import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoRoot } from "./_lib";
import { createBookWorkspace, runBun } from "./lib/book-workspace.fixture";
import { runChild, waitForChildren } from "./lib/child-process.fixture";

/** export:gitbook replaces its output folder, so it must never take one it did not write. */

let scratch: string;

waitForChildren();

const exportTo = (out: string, book = "on-call", cwd = repoRoot()) =>
	runChild(
		[
			process.execPath,
			join(repoRoot(), "scripts", "export-gitbook.ts"),
			"--book",
			book,
			"--out",
			out,
		],
		{ cwd },
	);

beforeEach(() => {
	scratch = mkdtempSync(join(tmpdir(), "bookkit-gitbook-"));
});

afterEach(() => {
	rmSync(scratch, { recursive: true, force: true });
});

describe("export:gitbook --out", () => {
	it("refuses a folder holding files it did not write, and deletes nothing", () => {
		const out = join(scratch, "notes");
		mkdirSync(out);
		writeFileSync(join(out, "notes.txt"), "mine");

		const result = exportTo(out);

		expect(result.status).toBe(1);
		expect(result.output).toContain("Refusing to replace");
		expect(existsSync(join(out, "notes.txt"))).toBe(true);
		expect(existsSync(join(out, "SUMMARY.md"))).toBe(false);
	});

	it("writes a new folder with its marker, and replaces its own export", () => {
		const out = join(scratch, "gitbook");
		expect(exportTo(out).status).toBe(0);
		expect(existsSync(join(out, ".bookkit-export"))).toBe(true);
		expect(existsSync(join(out, "SUMMARY.md"))).toBe(true);

		writeFileSync(join(out, "stale.md"), "from an earlier export");
		expect(exportTo(out).status).toBe(0);
		expect(existsSync(join(out, "stale.md"))).toBe(false);
	});

	it("keeps the default output folder out of git", () => {
		const ignored = Bun.spawnSync(
			["git", "check-ignore", "-q", "apps/on-call/exports/gitbook/SUMMARY.md"],
			{ cwd: repoRoot() },
		);
		expect(ignored.exitCode).toBe(0);
	});
});

describe("export:gitbook pages", () => {
	it("writes a page for every record of an MDX book and lists them in SUMMARY.md", () => {
		const out = join(scratch, "on-call");
		const result = exportTo(out);
		expect(result.status).toBe(0);

		const summary = readFileSync(join(out, "SUMMARY.md"), "utf8");
		for (const line of [
			"* [Introduction](README.md)",
			"## Chapters",
			"* [Own the incident, not the noise](chapters/overview.md)",
			"## Mechanisms and actions",
			"* [Incident Triage](mechanisms/incident-triage.md)",
			"  * [Classify severity](toolkit/classify-alert-severity.md)",
			"## Glossary",
			"## Examples",
		]) {
			expect(summary).toContain(line);
		}
		// Every listed page exists, and nothing MDX is left in the folder.
		for (const [, path] of summary.matchAll(/\]\(([^)]+)\)/g)) {
			expect(existsSync(join(out, path))).toBe(true);
		}
		const files = readdirSync(out, { recursive: true }).map(String);
		expect(files.filter((file) => file.endsWith(".mdx"))).toEqual([]);

		const action = readFileSync(
			join(out, "toolkit", "classify-alert-severity.md"),
			"utf8",
		);
		expect(action).toContain("# Classify severity");
		expect(action).toContain("## Steps by situation");
		expect(action).toContain("**To:** duty-manager");
		expect(readFileSync(join(out, "README.md"), "utf8")).toStartWith(
			"# On-Call Runbook\n",
		);
	});

	it("copies an imported note's image into .gitbook/assets and links it from the page", () => {
		const { workspace } = createBookWorkspace("gitbook-images-", "notes-book");
		try {
			const imported = runBun(
				[
					join(repoRoot(), "scripts", "import-book-from-markdown.ts"),
					"--book",
					"notes-book",
					"--dir",
					join(repoRoot(), "scripts", "lib", "fixtures", "import-notes"),
				],
				workspace,
			);
			expect(imported.exitCode).toBe(0);
			const out = join(scratch, "notes");
			expect(exportTo(out, "notes-book", workspace).status).toBe(0);
			expect(
				existsSync(join(out, ".gitbook", "assets", "handoff-board.png")),
			).toBe(true);
			expect(
				readFileSync(join(out, "chapters", "why-handoffs-fail.md"), "utf8"),
			).toContain(
				"![The handoff board in the ops room](../.gitbook/assets/handoff-board.png)",
			);
		} finally {
			rmSync(workspace, { recursive: true, force: true });
		}
	});
});
