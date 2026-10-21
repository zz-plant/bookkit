import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { repoRoot } from "./_lib";
import { runChild, waitForChildren } from "./lib/child-process.fixture";
import { publishedRecord, withBookStatus } from "./lib/publish-book";

/**
 * A project with one book, as create-bookkit makes: commands need no book
 * name, `publish` moves the book to published once release rules pass, and
 * `check <folder>` in the book checks the folder as part of it.
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
	workspace = mkdtempSync(join(tmpdir(), "bookkit-publish-"));
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

describe("one book", () => {
	it("is the book a command acts on when none is named", () => {
		const made = bookkit("new", "chapter", "Second thoughts");
		expect(made.status).toBe(0);
		expect(made.output).toContain(
			"apps/solo/src/content/book/chapters/02-second-thoughts.mdx",
		);
		rmSync(at("apps/solo/src/content/book/chapters/02-second-thoughts.mdx"));
	});
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

describe("bookkit publish", () => {
	it("leaves the book a draft while release rules fail, and says how to mark finished records", () => {
		const result = bookkit("publish");
		expect(result.status).toBe(1);
		expect(result.output).toContain(
			'Not published: fix the errors above; apps/solo/src/book.config.ts still says status: "draft".',
		);
		expect(result.output).toContain(
			"1 record(s) are drafts. If they are finished, bun run bookkit publish solo --records marks them published too.",
		);
		expect(readFileSync(at("apps/solo/src/book.config.ts"), "utf8")).toContain(
			'status: "draft"',
		);
	});

	it("rehearses --records without changing a file", () => {
		const result = bookkit("publish", "--dry-run", "--records");
		expect(result.status).toBe(0);
		expect(result.output).toContain("Ready: nothing above blocks publishing.");
		expect(
			readFileSync(
				at("apps/solo/src/content/book/chapters/01-start.mdx"),
				"utf8",
			),
		).toBe(CHAPTER);
	});

	it("marks the records and the book published, and names what comes next", () => {
		const result = bookkit("publish", "--records");
		expect(result.status).toBe(0);
		const config = readFileSync(at("apps/solo/src/book.config.ts"), "utf8");
		expect(config).toContain('\tstatus: "published",');
		// Only the book's own status changes.
		expect(config).toContain('records: [{ status: "kept" }]');
		expect(
			readFileSync(
				at("apps/solo/src/content/book/chapters/01-start.mdx"),
				"utf8",
			),
		).toContain("status: published");
		expect(result.output).toContain("bun run bookkit deploy solo --dry-run");

		const again = bookkit("publish");
		expect(again.output).toContain("solo is already published.");
	});
});

describe("publish's edits", () => {
	it("sets only the book's own status, and refuses a config with none", () => {
		expect(
			withBookStatus(
				'export const bookConfig = {\n\tstatus: "draft",\n\tnested: {\n\t\tstatus: "draft",\n\t},\n};\n',
				"published",
			),
		).toBe(
			'export const bookConfig = {\n\tstatus: "published",\n\tnested: {\n\t\tstatus: "draft",\n\t},\n};\n',
		);
		expect(withBookStatus("export const bookConfig = {};\n", "published")).toBe(
			null,
		);
	});

	it("marks a record without a status published too", () => {
		expect(publishedRecord("---\ntitle: A\n---\n\nText.\n")).toBe(
			"---\ntitle: A\nstatus: published\n---\n\nText.\n",
		);
		expect(publishedRecord('---\nstatus: "draft"\n---\n')).toBe(
			'---\nstatus: "published"\n---\n',
		);
	});
});
