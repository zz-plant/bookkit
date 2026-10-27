import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoRoot } from "./_lib";
import { runChild, waitForChildren } from "./lib/child-process.fixture";

/** audit:unused fails a released book's gaps, and lists a draft's as work to do. */

let workspace: string;

const writeBook = (book: string, status: string) => {
	const content = join(workspace, "apps", book, "src", "content", "book");
	for (const dir of ["mechanisms", "toolkit", "examples"]) {
		mkdirSync(join(content, dir), { recursive: true });
	}
	writeFileSync(
		join(workspace, "apps", book, "src", "book.config.ts"),
		`export const bookConfig = { slug: "${book}", status: "${status}" };\n`,
	);
	writeFileSync(
		join(content, "mechanisms", "untooled.mdx"),
		'---\nslug: untooled\ntitle: "Untooled"\n---\n',
	);
};

waitForChildren();

const audit = (book: string) =>
	runChild(
		[
			process.execPath,
			join(repoRoot(), "scripts", "audit-unused.ts"),
			"--book",
			book,
		],
		{ cwd: workspace },
	);

beforeAll(() => {
	workspace = mkdtempSync(join(tmpdir(), "bookkit-audit-"));
	writeBook("drafting", "draft");
	writeBook("released", "published");
});

afterAll(() => {
	rmSync(workspace, { recursive: true, force: true });
});

describe("audit:unused", () => {
	it("lists a draft's mechanisms without tools as still to write, and passes", () => {
		const result = audit("drafting");
		expect(result.status).toBe(0);
		expect(result.output).toContain("still to write");
		expect(result.output).toContain("untooled");
	});

	it("fails a published book with a mechanism no tool or example covers", () => {
		const result = audit("released");
		expect(result.status).toBe(1);
		expect(result.output).toContain("untooled");
	});

	it("holds a draft to the published rule with --release, as publish does", () => {
		const result = runChild(
			[
				process.execPath,
				join(repoRoot(), "scripts", "audit-unused.ts"),
				"--book",
				"drafting",
				"--release",
			],
			{ cwd: workspace },
		);
		expect(result.status).toBe(1);
		expect(result.output).toContain("checked as published");
	});

	it("passes for this repository's books", () => {
		const result = runChild(
			[process.execPath, join(repoRoot(), "scripts", "audit-unused.ts")],
			{ cwd: repoRoot() },
		);
		expect(result.status, result.output).toBe(0);
	});
});
