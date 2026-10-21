import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { repoRoot } from "./_lib";
import { runChild, waitForChildren } from "./lib/child-process.fixture";
import { parseFrontmatter } from "./lib/content-frontmatter";
import { nextMinorVersion } from "./lib/release-notes";

/**
 * Chapter moves and release notes as an author makes them, in a workspace of
 * their own: a chapter put between two others, a chapter renamed everywhere
 * it is named, and a release note started at the next version.
 */

waitForChildren();

let workspace: string;

const chapter = (slug: string, front = "", body = "Text.\n") =>
	`---\nslug: ${slug}\ntitle: "${slug}"\nstatus: draft\n${front}---\n\n${body}`;

const FILES: Record<string, string> = {
	"apps/notes/src/content/book/chapters/01-start.mdx": chapter("start"),
	"apps/notes/src/content/book/chapters/02-queue.mdx": chapter(
		"queue",
		"prerequisites:\n  - start\n",
	),
	"apps/notes/src/content/book/chapters/03-end.mdx": chapter(
		"end",
		"prerequisites: [start, queue]\n",
		"Back to [the queue](/read/chapters/queue#why).\n",
	),
	"apps/notes/src/content/book/chapters/imported.json": `${JSON.stringify(
		{
			about: "test",
			chapters: [
				{ source: "q.md", file: "02-queue.mdx", sha256: "x" },
				{ source: "e.md", file: "03-end.mdx", sha256: "y" },
			],
			images: [],
		},
		null,
		"\t",
	)}\n`,
	"apps/notes/src/content/book/releases/2026-01-01-first.mdx":
		'---\ntitle: "First"\nversion: "0.3.1"\ndate: "2026-01-01"\n---\n',
	"apps/notes/src/book.config.ts":
		'export const bookConfig = { readHub: { cards: [{ href: "/read/chapters/queue" }] } };\n',
};

const at = (path: string) => join(workspace, path);
const chapters = () =>
	readdirSync(at("apps/notes/src/content/book/chapters"))
		.filter((name) => name.endsWith(".mdx"))
		.sort();

const bookkit = (...args: string[]) =>
	runChild(
		[process.execPath, join(repoRoot(), "scripts", "bookkit.ts"), ...args],
		{ cwd: workspace },
	);

beforeAll(() => {
	workspace = mkdtempSync(join(tmpdir(), "bookkit-chapters-"));
	for (const entry of ["scripts", "packages", "node_modules"]) {
		symlinkSync(join(repoRoot(), entry), join(workspace, entry));
	}
	for (const [path, text] of Object.entries(FILES)) {
		mkdirSync(dirname(at(path)), { recursive: true });
		writeFileSync(at(path), text);
	}
	expect(bookkit("use", "notes").status).toBe(0);
});

afterAll(() => {
	rmSync(workspace, { recursive: true, force: true });
});

describe("new chapter --after", () => {
	it("puts the chapter after the one named, renumbering the files after it", () => {
		const made = bookkit(
			"new",
			"chapter",
			"Who holds the lever",
			"--after",
			"start",
		);
		expect(made.status).toBe(0);
		expect(made.output).toContain(
			"Renumbered apps/notes/src/content/book/chapters/03-end.mdx → apps/notes/src/content/book/chapters/04-end.mdx",
		);
		expect(chapters()).toEqual([
			"01-start.mdx",
			"02-who-holds-the-lever.mdx",
			"03-queue.mdx",
			"04-end.mdx",
		]);
		// The import manifest follows the files it names.
		const manifest = JSON.parse(
			readFileSync(
				at("apps/notes/src/content/book/chapters/imported.json"),
				"utf8",
			),
		);
		expect(
			manifest.chapters.map((entry: { file: string }) => entry.file),
		).toEqual(["03-queue.mdx", "04-end.mdx"]);
	});

	it("takes the chapter's number for --after", () => {
		const made = bookkit("new", "chapter", "Numbered", "--after", "4");
		expect(made.status).toBe(0);
		expect(chapters().at(-1)).toBe("05-numbered.mdx");
		rmSync(at("apps/notes/src/content/book/chapters/05-numbered.mdx"));
	});

	it("names a chapter that is not there", () => {
		const missing = bookkit("new", "chapter", "X", "--after", "strat");
		expect(missing.status).toBe(1);
		expect(missing.output).toContain(
			'notes has no chapter "strat". Did you mean start?',
		);
	});
});

describe("rename chapter", () => {
	it("changes the slug, the file name, prerequisites, and links together", () => {
		const renamed = bookkit("rename", "chapter", "queue", "waiting-line");
		expect(renamed.status).toBe(0);
		expect(chapters()).toContain("03-waiting-line.mdx");
		const own = parseFrontmatter(
			readFileSync(
				at("apps/notes/src/content/book/chapters/03-waiting-line.mdx"),
				"utf8",
			),
		).data;
		expect(own.slug).toBe("waiting-line");
		const end = readFileSync(
			at("apps/notes/src/content/book/chapters/04-end.mdx"),
			"utf8",
		);
		expect(parseFrontmatter(end).data.prerequisites).toEqual([
			"start",
			"waiting-line",
		]);
		expect(end).toContain("(/read/chapters/waiting-line#why)");
		expect(readFileSync(at("apps/notes/src/book.config.ts"), "utf8")).toContain(
			'"/read/chapters/waiting-line"',
		);
		const manifest = JSON.parse(
			readFileSync(
				at("apps/notes/src/content/book/chapters/imported.json"),
				"utf8",
			),
		);
		expect(manifest.chapters[0].file).toBe("03-waiting-line.mdx");
		// The book still checks clean.
		const check = runChild(
			[
				process.execPath,
				join(repoRoot(), "scripts", "validate-book.ts"),
				"--book",
				"notes",
			],
			{ cwd: workspace },
		).stdout;
		expect(check).not.toContain("not a chapter slug");
	});

	it("refuses a slug another chapter has", () => {
		const taken = bookkit("rename", "chapter", "start", "end");
		expect(taken.status).toBe(1);
		expect(taken.output).toContain('notes already has a chapter "end"');
	});
});

describe("new release", () => {
	it("starts a dated note at the next minor version", () => {
		const made = bookkit("new", "release", "Second draft");
		expect(made.status).toBe(0);
		expect(made.output).toContain("version 0.4.0");
		const [note] = readdirSync(
			at("apps/notes/src/content/book/releases"),
		).filter((name) => name.endsWith("-second-draft.mdx"));
		const data = parseFrontmatter(
			readFileSync(at(`apps/notes/src/content/book/releases/${note}`), "utf8"),
		).data;
		expect(data).toMatchObject({ title: "Second draft", version: "0.4.0" });
		expect(String(data.date)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(nextMinorVersion([])).toBe("0.1.0");
		expect(nextMinorVersion(["1.9.3", "1.10.0", "draft"])).toBe("1.11.0");
	});
});

describe("export", () => {
	it("writes the GitBook export of the current book and says where the PDF comes from", () => {
		const exported = bookkit("export");
		expect(exported.status).toBe(0);
		expect(existsSync(at("apps/notes/exports/gitbook/SUMMARY.md"))).toBe(true);
		expect(exported.output).toContain(
			"The PDF and EPUB come from the build: bun run bookkit build notes",
		);
	});
});
