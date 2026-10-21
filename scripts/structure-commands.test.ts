import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parseFrontmatter } from "../packages/astro-bookkit/src/utils/frontmatter";
import { repoRoot } from "./_lib";
import { runChild, waitForChildren } from "./lib/child-process.fixture";

/**
 * Structure edits an author used to make by hand: a mechanism renamed in
 * every book of its corpus, shared with another book, a tool bound to
 * another mechanism, records removed with what names them, a glossary entry
 * started, and the checks that come with them (a release note, a missing
 * image, a list field written as text).
 */

waitForChildren();

let workspace: string;

const mechanism = (slug: string, title: string) => `---
slug: ${slug}
status: draft
title: "${title}"
definition: "${title} as a tactic."
is:
  - "${title} is."
isNot:
  - "${title} is not."
predictions:
  - "${title} predicts."
tests:
  - "${title} tests."
---
`;

const chapter = (slug: string, front = "", body = "Text.\n") =>
	`---\nslug: ${slug}\ntitle: "${slug}"\nsummary: A chapter.\nstatus: draft\n${front}---\n\n${body}`;

const FILES: Record<string, string> = {
	"corpus.json":
		'{\n\t"books": ["one", "two"],\n\t"distinct": [],\n\t"merged": []\n}\n',
	"apps/one/src/book.config.ts":
		'export const bookConfig = { slug: "one", status: "draft" };\n',
	"apps/one/src/content/book/mechanisms/waiting-game.mdx": mechanism(
		"waiting-game",
		"Waiting game",
	),
	"apps/one/src/content/book/mechanisms/slow-walk.mdx": mechanism(
		"slow-walk",
		"Slow walk",
	),
	"apps/one/src/content/book/mechanisms/dead-end.mdx": mechanism(
		"dead-end",
		"Dead end",
	),
	"apps/one/src/content/book/toolkit/waiting-game--deadline.mdx":
		'---\nslug: deadline\nstatus: draft\nmechanism: waiting-game\nname: "Deadline"\n---\n\nSet one.\n',
	"apps/one/src/content/book/toolkit/dead-end--exit.mdx":
		'---\nslug: exit\nstatus: draft\nmechanism: dead-end\nname: "Exit"\n---\n\nLeave.\n',
	"apps/one/src/content/book/examples/waiting-game/stall.mdx":
		'---\nmechanism: waiting-game\ndomain: work\ntitle: "Stall"\nstatus: draft\n---\n\nA stall.\n',
	"apps/one/src/content/book/examples/dead-end/wall.mdx":
		'---\nmechanism: dead-end\ndomain: work\ntitle: "Wall"\nstatus: draft\n---\n\nA wall.\n',
	"apps/one/src/content/book/glossary/waiting-game.mdx":
		'---\nslug: waiting-game\nstatus: draft\nterm: "Waiting game"\n---\n\nStalling.\n',
	"apps/one/src/content/book/chapters/01-intro.mdx": chapter(
		"intro",
		"mechanisms:\n  - slow-walk\n  - waiting-game\n  - dead-end\n",
		"See [the stall](/read/mechanisms/waiting-game).\n\n![The board](/images/nope.png)\n",
	),
	"apps/one/src/content/book/chapters/02-next.mdx": chapter(
		"next",
		"prerequisites: [intro, gone]\n",
	),
	"apps/one/src/content/book/chapters/03-gone.mdx": chapter("gone"),
	"apps/one/src/content/book/releases/2026-01-01-first.mdx":
		'---\ntitle: "First"\nversion: "v1"\ndate: "2026-01-01"\nhighlights: "One thing"\n---\n',
	"apps/two/src/book.config.ts":
		'export const bookConfig = { slug: "two", status: "draft" };\n',
	"apps/two/src/content/book/mechanisms/waiting-game.mdx": mechanism(
		"waiting-game",
		"Waiting game",
	),
	"apps/two/src/content/book/mechanisms/tidy-desk.mdx": mechanism(
		"tidy-desk",
		"Tidy desk",
	),
	"apps/two/src/content/book/chapters/01-start.mdx": chapter(
		"start",
		"mechanisms: [waiting-game]\n",
	),
};

const at = (path: string) => join(workspace, path);
const read = (path: string) => readFileSync(at(path), "utf8");
const front = (path: string) => parseFrontmatter(read(path)).data;

const bookkit = (...args: string[]) =>
	runChild(
		[process.execPath, join(repoRoot(), "scripts", "bookkit.ts"), ...args],
		{ cwd: workspace },
	);

beforeAll(() => {
	workspace = mkdtempSync(join(tmpdir(), "bookkit-structure-"));
	for (const [path, text] of Object.entries(FILES)) {
		mkdirSync(dirname(at(path)), { recursive: true });
		writeFileSync(at(path), text);
	}
	for (const book of ["one", "two"]) {
		for (const section of ["toolkit", "examples", "glossary"]) {
			mkdirSync(at(`apps/${book}/src/content/book/${section}`), {
				recursive: true,
			});
		}
	}
});

afterAll(() => {
	rmSync(workspace, { recursive: true, force: true });
});

describe("move tool", () => {
	it("binds a tool to another mechanism, found by its slug or file name", () => {
		const moved = bookkit(
			"move",
			"tool",
			"one",
			"waiting-game--deadline",
			"--to",
			"slow-walk",
		);
		expect(moved.status).toBe(0);
		expect(
			front("apps/one/src/content/book/toolkit/waiting-game--deadline.mdx")
				.mechanism,
		).toBe("slow-walk");
		expect(moved.output).toContain("still begins with waiting-game");
		expect(
			bookkit("move", "tool", "one", "deadline", "--to", "nope").output,
		).toContain('one has no mechanism "nope"');
	});
});

describe("rename mechanism", () => {
	it("refuses a slug another mechanism has", () => {
		const taken = bookkit("rename", "mechanism", "waiting-game", "slow-walk");
		expect(taken.status).toBe(1);
		expect(taken.output).toContain("slow-walk is already a mechanism");
	});

	it("renames it in every book of its corpus, with what names it, and records the old slug", () => {
		const renamed = bookkit(
			"rename",
			"mechanism",
			"waiting-game",
			"stalling",
			"--title",
			"Stalling",
		);
		expect(renamed.status).toBe(0);
		for (const book of ["one", "two"]) {
			expect(
				existsSync(at(`apps/${book}/src/content/book/mechanisms/stalling.mdx`)),
			).toBe(true);
			expect(
				existsSync(
					at(`apps/${book}/src/content/book/mechanisms/waiting-game.mdx`),
				),
			).toBe(false);
		}
		expect(
			front("apps/one/src/content/book/mechanisms/stalling.mdx"),
		).toMatchObject({ slug: "stalling", title: "Stalling" });
		expect(
			front("apps/one/src/content/book/chapters/01-intro.mdx").mechanisms,
		).toEqual(["slow-walk", "stalling", "dead-end"]);
		expect(read("apps/one/src/content/book/chapters/01-intro.mdx")).toContain(
			"/read/mechanisms/stalling",
		);
		expect(
			existsSync(at("apps/one/src/content/book/examples/stalling/stall.mdx")),
		).toBe(true);
		expect(
			front("apps/two/src/content/book/chapters/01-start.mdx").mechanisms,
		).toEqual(["stalling"]);
		const corpus = JSON.parse(read("corpus.json"));
		expect(corpus.merged[0]).toMatchObject({ into: "stalling" });
	});
});

describe("sync --to", () => {
	it("shares a mechanism with a book that has none, and refuses one that has it", () => {
		const shared = bookkit("sync", "tidy-desk", "--to", "one");
		expect(shared.status).toBe(0);
		expect(read("apps/one/src/content/book/mechanisms/tidy-desk.mdx")).toBe(
			read("apps/two/src/content/book/mechanisms/tidy-desk.mdx"),
		);
		expect(bookkit("sync", "tidy-desk", "--to", "one").output).toContain(
			"one already has tidy-desk",
		);
		expect(bookkit("sync", "tidy-desk", "--too", "one").output).toContain(
			"Unknown option --too",
		);
	});
});

describe("remove", () => {
	it("refuses a mechanism with tools and examples unless --with-records", () => {
		const refused = bookkit("remove", "mechanism", "one", "dead-end");
		expect(refused.status).toBe(1);
		expect(refused.output).toContain(
			"dead-end has 1 tool(s) and 1 example(s) bound to it",
		);
		const removed = bookkit(
			"remove",
			"mechanism",
			"one",
			"dead-end",
			"--with-records",
		);
		expect(removed.status).toBe(0);
		for (const path of [
			"mechanisms/dead-end.mdx",
			"toolkit/dead-end--exit.mdx",
			"examples/dead-end/wall.mdx",
		]) {
			expect(existsSync(at(`apps/one/src/content/book/${path}`))).toBe(false);
		}
		expect(
			front("apps/one/src/content/book/chapters/01-intro.mdx").mechanisms,
		).toEqual(["slow-walk", "stalling"]);
	});

	it("removes a chapter and the prerequisites that name it", () => {
		const removed = bookkit("remove", "chapter", "one", "gone");
		expect(removed.status).toBe(0);
		expect(
			existsSync(at("apps/one/src/content/book/chapters/03-gone.mdx")),
		).toBe(false);
		expect(
			front("apps/one/src/content/book/chapters/02-next.mdx").prerequisites,
		).toEqual(["intro"]);
	});

	it("names a kind it cannot remove", () => {
		expect(bookkit("remove", "chaptr", "x").output).toContain(
			"Did you mean chapter?",
		);
	});
});

describe("new glossary", () => {
	it("starts an entry with its term, slug, and definition", () => {
		const made = bookkit(
			"new",
			"glossary",
			"one",
			"Pager queue",
			"--definition",
			"Alerts waiting for an owner.",
		);
		expect(made.status).toBe(0);
		expect(
			front("apps/one/src/content/book/glossary/pager-queue.mdx"),
		).toMatchObject({
			term: "Pager queue",
			slug: "pager-queue",
			definition: "Alerts waiting for an owner.",
		});
		expect(made.output).toContain("[pager queue](/read/glossary/pager-queue)");
	});
});

describe("checks", () => {
	it("checks a release note as the release page reads it", () => {
		const checked = bookkit(
			"check",
			"apps/one/src/content/book/releases/2026-01-01-first.mdx",
		);
		expect(checked.output).toContain('version "v1" is not x.y.z');
		expect(checked.output).toContain("highlights is not a list");
		expect(bookkit("contract", "release").output).toContain(
			"version            warning",
		);
	});

	it("warns about an image the book does not have", () => {
		const result = runChild(
			[
				process.execPath,
				join(repoRoot(), "scripts", "validate-book.ts"),
				"--book",
				"one",
				"--json",
			],
			{ cwd: workspace },
		);
		const findings = JSON.parse(result.stdout).findings as Array<{
			code: string;
			message: string;
		}>;
		expect(findings.find((f) => f.code === "IMAGE_MISSING")?.message).toContain(
			"Shows the image /images/nope.png on line",
		);
	});
});

describe("the book a command acts on", () => {
	it("takes a title that is also a book's name as the title, in the current book", () => {
		expect(bookkit("use", "two").status).toBe(0);
		const made = bookkit("new", "chapter", "one");
		expect(made.status).toBe(0);
		expect(
			existsSync(at("apps/two/src/content/book/chapters/02-one.mdx")),
		).toBe(true);
	});
});
