import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoRoot } from "./_lib";
import { runChild, waitForChildren } from "./lib/child-process.fixture";

/**
 * The suggestion and proposal commands, run through the real package.json
 * scripts in a scratch workspace: a book of imported notes that keep using
 * "context debt", a gardening book outside the shared corpus, and two books
 * that corpus.json puts in it.
 */

let workspace: string;

const NOTES: Record<string, string> = {
	"01-why-handoffs-fail.mdx":
		"Most incidents fail at the handoff.\n\n## Context debt\n\nEvery undocumented assumption is a loan against the next shift. Context debt compounds:\n\n- the first shift knows why\n- the third shift knows nothing\n",
	"02-shift-rhythm.mdx":
		"A shift has three beats. Context debt piles up when the hand-off beat is skipped.\n",
	"03-handoff-checklist.mdx":
		"A 10-minute checklist. Context debt is paid down here.\n",
	"05-retro-notes.mdx":
		"We lost two hours because the handoff note said looking into it. Context debt again.\n",
};

const chapter = (slug: string, body: string) =>
	`---\nslug: ${slug}\ntitle: "${slug}"\nstatus: draft\n---\n\n${body}`;

const mechanism = (slug: string, definition: string, is: string) => `---
slug: ${slug}
title: "${slug.replace(/-/g, " ")}"
definition: "${definition}"
is:
  - "${is}"
isNot:
  - "Not knowing."
predictions:
  - "It shows."
tests:
  - "Look."
status: draft
---
`;

const writeBook = (book: string, files: Record<string, string>) => {
	const content = join(workspace, "apps", book, "src", "content", "book");
	for (const dir of ["chapters", "mechanisms", "toolkit", "glossary"]) {
		mkdirSync(join(content, dir), { recursive: true });
	}
	for (const [file, source] of Object.entries(files)) {
		writeFileSync(join(content, file), source);
	}
};

waitForChildren();

const run = (...args: string[]) =>
	runChild([process.execPath, "run", ...args], { cwd: workspace });

const handoffs = () =>
	Object.fromEntries(
		Object.entries(NOTES).map(([file, body]) => [
			`chapters/${file}`,
			chapter(file.replace(/\.mdx$/, ""), body),
		]),
	);

beforeAll(() => {
	workspace = mkdtempSync(join(tmpdir(), "bookkit-suggestions-"));
	for (const dir of ["scripts", "packages", "node_modules"]) {
		symlinkSync(join(repoRoot(), dir), join(workspace, dir));
	}
	copyFileSync(
		join(repoRoot(), "package.json"),
		join(workspace, "package.json"),
	);
	writeFileSync(
		join(workspace, "corpus.json"),
		JSON.stringify({ books: ["essays", "letters"], distinct: [] }),
	);

	writeBook("handoffs", handoffs());
	writeBook("handoffs-apply", handoffs());
	writeBook("empty", {});
	// Three chapters that rely on one mechanism, and one prerequisite.
	const reliesOn = (slug: string, front: string) =>
		`---\nslug: ${slug}\ntitle: "${slug}"\nstatus: draft\n${front}mechanisms:\n  - queue-reset\n---\n\nText.\n`;
	writeBook("edges", {
		"chapters/01-basics.mdx": reliesOn("basics", ""),
		"chapters/02-later.mdx": reliesOn("later", ""),
		"chapters/03-third.mdx": reliesOn("third", "prerequisites: [basics]\n"),
		"mechanisms/queue-reset.mdx": mechanism(
			"queue-reset",
			"Sending people to the back of the line on any error.",
			"Resets on any error",
		),
	});
	const knowing =
		"Institutions regularly identify problems they refuse to solve";
	writeBook("essays", {
		"chapters/01-inference.mdx": chapter("inference", "Essays.\n"),
		"mechanisms/cowardice-of-inference.mdx": mechanism(
			"cowardice-of-inference",
			"Drawing the correct conclusion without the courage to act on it.",
			knowing,
		),
	});
	writeBook("letters", {
		"chapters/01-letters.mdx": chapter("letters", "Letters.\n"),
		"mechanisms/slow-reply.mdx": mechanism(
			"slow-reply",
			"Answering late so the question goes away.",
			"Replies arrive after the deadline",
		),
	});
	writeBook("garden-notes", {
		"chapters/01-soil.mdx": chapter("soil", "Soil first.\n"),
		"mechanisms/compaction-debt.mdx": mechanism(
			"compaction-debt",
			"Gardeners draw the correct conclusion that the bed is compacted, without the courage to act on it.",
			knowing,
		),
	});
});

afterAll(() => {
	rmSync(workspace, { recursive: true, force: true });
});

describe("package.json scripts take a book either way", () => {
	for (const args of [
		["check:suggestions", "--", "--book", "handoffs"],
		["check:suggestions", "handoffs"],
	]) {
		it(`bun run ${args.join(" ")} analyzes handoffs`, () => {
			const result = run(...args);
			expect(result.status).toBe(0);
			expect(result.output).toContain(
				"[handoffs] read 4 chapters (68 words of prose), 0 mechanisms, 0 examples, 0 tools",
			);
			expect(result.output).not.toContain("[essays]");
		});
	}

	for (const args of [
		["check:concepts", "--", "--book", "handoffs"],
		["check:concepts", "handoffs"],
	]) {
		it(`bun run ${args.join(" ")} checks handoffs only`, () => {
			const result = run(...args);
			expect(result.status).toBe(0);
			expect(result.output).toContain("Checking concept registry: handoffs");
			expect(result.output).toContain("4 file(s) in 1 book(s) read");
			expect(result.output).not.toContain("Checking concept registry: essays");
		});
	}

	for (const args of [
		["propose", "handoffs"],
		["propose", "--", "--book", "handoffs"],
		["bookkit", "propose", "handoffs"],
	]) {
		it(`bun run ${args.join(" ")} proposes for handoffs`, () => {
			const result = run(...args);
			expect(result.status).toBe(0);
			expect(result.output).toContain("PROPOSAL BUNDLE [handoffs]");
		});
	}

	it("stops on a --book with no book after it, or a book that does not exist", () => {
		const dangling = run("check:suggestions", "--", "--book");
		expect(dangling.status).toBe(1);
		expect(dangling.output).toContain("--book needs a book after it.");

		const unknown = run("check:suggestions", "--", "--book", "handof");
		expect(unknown.status).toBe(1);
		expect(unknown.output).toContain(
			'Book "handof" not found. Did you mean handoffs?',
		);

		const none = run("propose");
		expect(none.status).toBe(1);
		expect(none.output).toContain("Name the book to run on.");
	});

	it("has one script per job", () => {
		const { scripts } = JSON.parse(
			readFileSync(join(repoRoot(), "package.json"), "utf8"),
		) as { scripts: Record<string, string> };
		for (const name of [
			"check:suggestions:all",
			"check:concepts:book",
			"propose:book",
		]) {
			expect(scripts[name]).toBeUndefined();
		}
		for (const command of Object.values(scripts)) {
			expect(command).not.toMatch(/--book$/);
		}
	});
});

describe("recurring concepts", () => {
	it("check:suggestions reports a lowercase recurring term with its evidence", () => {
		const result = run("check:suggestions", "handoffs");
		expect(result.output).toContain(
			'chapters/01-why-handoffs-fail.mdx: "context debt" recurs 4 times across 4 files and is not a registered mechanism or glossary term. Draft: context-debt (definition and boundaries left for you).',
		);
		expect(result.output).toContain(
			'e.g. chapters/01-why-handoffs-fail.mdx: "Context debt compounds:"',
		);
	});

	it("propose says what it read, and why there is nothing to propose", () => {
		const found = run("propose", "handoffs");
		expect(found.output).toContain("read: 4 chapter(s), 68 words of prose");
		expect(found.output).toContain(
			'[mechanism:context-debt] "Context debt": used 4 times in 4 chapters (draft; you write the definition and boundaries)',
		);
		expect(found.output).toContain(
			'[tool:context-debt--starter-tool] mechanism "context-debt" · "Starter tool for Context debt"',
		);

		const empty = run("propose", "empty");
		expect(empty.status).toBe(0);
		expect(empty.output).toContain(
			"(none) nothing analyzed: no chapter prose in apps/empty/src/content/book/chapters.",
		);
	});

	it("propose --apply writes drafts that carry evidence, not invented definitions", () => {
		const result = run(
			"propose",
			"handoffs-apply",
			"--apply",
			"mechanisms",
			"--apply",
			"tools",
		);
		expect(result.status).toBe(0);
		const content = join(workspace, "apps/handoffs-apply/src/content/book");
		const written = readFileSync(
			join(content, "mechanisms/context-debt.mdx"),
			"utf8",
		);
		expect(written).toContain('\ndefinition: "" # One or two sentences');
		expect(written).toContain("\nstatus: draft\n");
		expect(written).toContain('"context debt" is used 4 times');
		expect(
			existsSync(join(content, "toolkit/context-debt--starter-tool.mdx")),
		).toBe(true);
		expect(
			existsSync(join(content, "toolkit/context-debt-context-debt.mdx")),
		).toBe(false);
	});
});

describe("propose --apply edges", () => {
	it("writes prerequisites into the chapters, in reading order, without a loop", () => {
		const shown = run("propose", "edges", "--apply", "mechanisms");
		expect(shown.output).toContain(
			"prerequisite edge(s) not written: --apply edges adds them",
		);
		const result = run("propose", "edges", "--apply", "edges");
		expect(result.status).toBe(0);
		expect(result.output).toContain(
			"apps/edges/src/content/book/chapters/02-later.mdx: prerequisites + basics",
		);
		expect(result.output).toContain(
			"apps/edges/src/content/book/chapters/03-third.mdx: prerequisites + later",
		);
		expect(result.output).toContain("skipped edge:later->basics");
		const chapters = join(workspace, "apps/edges/src/content/book/chapters");
		expect(readFileSync(join(chapters, "02-later.mdx"), "utf8")).toContain(
			"prerequisites:\n  - basics\nmechanisms:",
		);
		expect(readFileSync(join(chapters, "03-third.mdx"), "utf8")).toContain(
			"prerequisites: [basics, later]",
		);
		expect(readFileSync(join(chapters, "01-basics.mdx"), "utf8")).not.toContain(
			"prerequisites",
		);
		// Applied once, nothing is left to propose.
		expect(run("propose", "edges").output).toContain("edges (0)");
	});
});

describe("mechanisms across books", () => {
	it("checks a book outside the shared corpus against itself, listing other books for information", () => {
		const result = run(
			"scripts/check-corpus.ts",
			"--book",
			"garden-notes",
			"--no-semantic",
			"--mode",
			"error",
		);
		expect(result.status).toBe(0);
		expect(result.output).toContain(
			'garden-notes is not in corpus.json "books", so its mechanisms are compared with each other',
		);
		expect(result.output).toContain(
			"- compaction-debt (garden-notes) ~ cowardice-of-inference (essays): lexical",
		);
		expect(result.output).toContain("No unresolved overlapping mechanisms.");
	});

	it("covers every book, naming the ones outside the shared corpus", () => {
		const result = run("scripts/check-corpus.ts", "--no-semantic");
		expect(result.output).toContain(
			'shared corpus (corpus.json "books"): essays, letters',
		);
		expect(result.output).toMatch(/checked on their own: .*garden-notes/);
	});

	it("bookkit check <mechanism file> does not call another corpus's mechanism a duplicate", () => {
		const result = run(
			"bookkit",
			"check",
			"apps/garden-notes/src/content/book/mechanisms/compaction-debt.mdx",
		);
		expect(result.output).not.toContain("may duplicate");
		expect(result.output).toContain(
			"similar wording in books outside garden-notes's corpus (for information; nothing to change):\n    cowardice-of-inference (essays)",
		);
	});
});
