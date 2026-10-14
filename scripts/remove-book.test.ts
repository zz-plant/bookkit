import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoRoot } from "./_lib";

/** `remove:book` in a scratch git repository holding one committed book. */

let workspace: string;

const run = (command: string[]) => {
	const result = Bun.spawnSync(command, {
		cwd: workspace,
		stdin: "ignore",
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		status: result.exitCode,
		output: `${result.stdout.toString()}${result.stderr.toString()}`,
	};
};

const removeBook = (...args: string[]) =>
	run([
		process.execPath,
		join(repoRoot(), "scripts", "remove-book.ts"),
		...args,
	]);

const git = (...args: string[]) =>
	run([
		"git",
		"-c",
		"user.name=test",
		"-c",
		"user.email=test@example.com",
		...args,
	]);

const chapter = () =>
	join(
		workspace,
		"apps",
		"on-call",
		"src",
		"content",
		"book",
		"chapters",
		"01-a.mdx",
	);

const exists = () => existsSync(join(workspace, "apps", "on-call"));

beforeEach(() => {
	workspace = mkdtempSync(join(tmpdir(), "bookkit-remove-"));
	mkdirSync(join(chapter(), ".."), { recursive: true });
	writeFileSync(chapter(), "---\nslug: a\n---\n");
	git("init", "--quiet");
	git("add", ".");
	git("commit", "--quiet", "-m", "book");
});

afterEach(() => {
	rmSync(workspace, { recursive: true, force: true });
});

describe("remove:book", () => {
	it("takes only the exact folder name", () => {
		const result = removeBook("--book", "On Call", "--yes");
		expect(result.status).toBe(1);
		expect(result.output).toContain(
			'No book "On Call" in apps/. Did you mean on-call?',
		);
		expect(exists()).toBe(true);
	});

	it("says what it would delete and asks before deleting", () => {
		const result = removeBook("--book", "on-call");
		expect(result.output).toContain("apps/on-call: 1 files (1 chapters");
		expect(result.output).toContain("Pass --yes to delete apps/on-call.");
		expect(result.status).toBe(1);
		expect(exists()).toBe(true);

		expect(removeBook("--book", "on-call", "--dry-run").status).toBe(0);
		expect(exists()).toBe(true);
	});

	it("refuses to delete uncommitted work without --force", () => {
		writeFileSync(chapter(), "---\nslug: a\n---\nUnsaved draft.\n");
		const refused = removeBook("--book", "on-call", "--yes");
		expect(refused.status).toBe(1);
		expect(refused.output).toContain(
			"apps/on-call/src/content/book/chapters/01-a.mdx",
		);
		expect(refused.output).toContain("Refusing to delete");
		expect(exists()).toBe(true);

		expect(removeBook("--book", "on-call", "--yes", "--force").status).toBe(0);
		expect(exists()).toBe(false);
	});

	it("deletes a committed book with --yes", () => {
		const result = removeBook("--book", "on-call", "--yes");
		expect(result.status).toBe(0);
		expect(result.output).toContain("Deleted apps/on-call.");
		expect(exists()).toBe(false);
	});
});
