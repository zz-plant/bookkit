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

/** export:gitbook replaces its output folder, so it must never take one it did not write. */

let scratch: string;

const exportTo = (out: string) => {
	const result = Bun.spawnSync(
		[
			process.execPath,
			join(repoRoot(), "scripts", "export-gitbook.ts"),
			"--book",
			"on-call",
			"--out",
			out,
		],
		{ cwd: repoRoot(), stdout: "pipe", stderr: "pipe" },
	);
	return {
		status: result.exitCode,
		output: `${result.stdout.toString()}${result.stderr.toString()}`,
	};
};

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
