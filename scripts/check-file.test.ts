import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoRoot } from "./_lib";
import { runChild, waitForChildren } from "./lib/child-process.fixture";

/**
 * `bookkit check <file>`: the file inside its book, then the MDX compiler the
 * build uses, so "compiles" means it does.
 */

let workspace: string;
const chapters = join("apps", "a-book", "src", "content", "book", "chapters");

waitForChildren();

const check = (file: string) =>
	runChild(
		[
			process.execPath,
			join(repoRoot(), "scripts", "bookkit.ts"),
			"check",
			join(chapters, file),
		],
		{ cwd: workspace },
	);

const chapter = (slug: string, body: string, extra = "") =>
	`---\nslug: ${slug}\ntitle: "${slug}"\nstatus: draft\n${extra}---\n${body}\n`;

beforeAll(() => {
	workspace = mkdtempSync(join(tmpdir(), "bookkit-check-file-"));
	const content = join(workspace, "apps", "a-book", "src", "content", "book");
	for (const dir of [
		"chapters",
		"mechanisms",
		"toolkit",
		"examples",
		"glossary",
	]) {
		mkdirSync(join(content, dir), { recursive: true });
	}
	writeFileSync(
		join(workspace, chapters, "01-fine.mdx"),
		chapter("fine", "Plain prose."),
	);
	writeFileSync(
		join(workspace, chapters, "02-braces.mdx"),
		chapter("braces", "Fine prose.\n\nA literal {brace in prose."),
	);
	writeFileSync(
		join(workspace, chapters, "03-twin.mdx"),
		chapter("fine", "The same slug as 01-fine."),
	);
});

afterAll(() => {
	rmSync(workspace, { recursive: true, force: true });
});

describe("bookkit check <file>", () => {
	it("says a file compiles only after compiling it", () => {
		const result = check("01-fine.mdx");
		expect(result.status).toBe(0);
		expect(result.output).toContain("compiles with no findings");
	});

	it("reports a syntax error with the line the build would stop at", () => {
		const result = check("02-braces.mdx");
		expect(result.status).toBe(1);
		expect(result.output).toContain("02-braces.mdx (chapter in a-book)");
		expect(result.output).toContain("error: MDX does not compile at line 8");
		expect(result.output).not.toContain("compiles with no findings");
	});

	it("checks the file inside its book, as validate does", () => {
		const result = check("03-twin.mdx");
		expect(result.status).toBe(1);
		expect(result.output).toContain('Chapter slug "fine" is also used by');
	});
});
