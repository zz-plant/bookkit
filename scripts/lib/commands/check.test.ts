import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { repoRoot } from "../../_lib";
import { runChild, waitForChildren } from "../child-process.fixture";

/**
 * `bookkit check <folder>` in a project with one book, as create-bookkit
 * makes: a folder inside the book is checked as part of it. `check <file>`
 * is in check-file.test.ts.
 */

waitForChildren();

let workspace: string;

const CHAPTER =
	"---\nslug: start\ntitle: Start\nsummary: Where it starts.\nstatus: draft\n---\n\nText.\n";

const FILES: Record<string, string> = {
	"apps/solo/src/book.config.ts":
		'export const bookConfig = {\n\tslug: "solo",\n\ttitle: "Solo",\n\tstatus: "draft",\n\tsite: { url: "https://solo.example" },\n\trecords: [{ status: "kept" }],\n};\n',
	"apps/solo/src/content/book/chapters/01-start.mdx": CHAPTER,
};

const at = (path: string) => join(workspace, path);

const bookkit = (...args: string[]) =>
	runChild(
		[process.execPath, join(repoRoot(), "scripts", "bookkit.ts"), ...args],
		{ cwd: workspace },
	);

beforeAll(() => {
	workspace = mkdtempSync(join(tmpdir(), "bookkit-check-folder-"));
	symlinkSync(join(repoRoot(), "scripts"), join(workspace, "scripts"));
	for (const section of [
		"chapters",
		"mechanisms",
		"toolkit",
		"examples",
		"glossary",
	]) {
		mkdirSync(at(`apps/solo/src/content/book/${section}`), {
			recursive: true,
		});
	}
	for (const [path, text] of Object.entries(FILES)) {
		mkdirSync(dirname(at(path)), { recursive: true });
		writeFileSync(at(path), text);
	}
});

afterAll(() => {
	rmSync(workspace, { recursive: true, force: true });
});

describe("check <folder> in a book", () => {
	it("checks the folder with the book's rules, naming each file's findings", () => {
		writeFileSync(
			at("apps/solo/src/content/book/chapters/02-broken.mdx"),
			"---\nslug: broken\ntitle: Broken\nsummary: It breaks.\nstatus: draft\nprerequisites:\n  - strat\n---\n\nA literal {brace.\n",
		);
		const result = bookkit("check", "apps/solo/src/content/book/chapters");
		rmSync(at("apps/solo/src/content/book/chapters/02-broken.mdx"));
		expect(result.status).toBe(1);
		expect(result.output).toContain(
			"apps/solo/src/content/book/chapters: 2 file(s), checked as part of solo",
		);
		expect(result.output).toContain("✗ 02-broken.mdx");
		expect(result.output).toContain("MDX does not compile");
		expect(result.output).toContain("strat");
	});
});
