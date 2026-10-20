import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { draftCopy } from "../packages/astro-bookkit/src/book/chapter-copy";
import { createBookWorkspace, runBun } from "./lib/book-workspace.fixture";

/**
 * What tells a reader where they are and where to start, in a new book built
 * from the shared templates: the hub's "Where to start" ends with chapter 1,
 * the page built from book.config.ts is "About this book", a draft book says
 * so on its home page and hub, each chapter says "Chapter N of M" in the
 * order the index lists, the menu lists the read sections with the current
 * one marked, and page titles use the book's short title. The book's title
 * has a subtitle, and a second chapter that `order:` puts first.
 */

const BOOK = "orientation";
const SHORT_TITLE = "Tide Tables";

let workspace: string;
let appDir: string;
let build: { exitCode: number | null; output: string };

const page = (path: string) =>
	readFileSync(join(appDir, "dist", path, "index.html"), "utf8");

/** The `aria-current` of each Sections link in the menu. */
const sectionMarks = (html: string): Array<[string, string | null]> => {
	const group = html.slice(
		html.indexOf('class="site-nav__group site-nav__group--sections"'),
		html.indexOf('class="site-nav__group site-nav__group--reader"'),
	);
	return [
		...group.matchAll(/<a href="([^"]+)"(?: aria-current="([^"]+)")?/g),
	].map((match) => [match[1], match[2] ?? null]);
};

beforeAll(() => {
	({ workspace, appDir } = createBookWorkspace("orientation-", BOOK));
	const configPath = join(appDir, "src", "book.config.ts");
	writeFileSync(
		configPath,
		readFileSync(configPath, "utf8").replace(
			/\ttitle: "[^"]*",/,
			`\ttitle: "${SHORT_TITLE}: Reading the Shore",`,
		),
	);
	// Later by file name, first by `order:`.
	writeFileSync(
		join(appDir, "src", "content", "book", "chapters", "05-low-water.mdx"),
		'---\nslug: low-water\ntitle: "Low water"\nsummary: "What the shore shows at the ebb."\nstatus: draft\norder: 1\n---\n\n## Read the line\n\nThe tide line is the record.\n',
	);
	build = runBun(["run", "build"], appDir);
}, 240_000);

afterAll(() => rmSync(workspace, { recursive: true, force: true }));

describe("reader orientation", () => {
	it("builds", () => {
		expect(build.exitCode, build.output).toBe(0);
	});

	it("ends the hub's default Where to start cards with chapter 1", () => {
		const cards = [
			...page("read").matchAll(
				/<a class="card quick-start-card[^"]*" href="([^"]+)"[^>]*><h2>([^<]+)<\/h2><p class="meta">([^<]+)<\/p>/g,
			),
		].map((match) => [match[1], match[2], match[3]]);
		expect(cards).toEqual([
			[
				"/read/overview",
				"About this book",
				"What the book sets out to do, its approach, and its ground rules.",
			],
			[
				"/read/chapters",
				"Read the chapters in order",
				"The full argument, start to finish.",
			],
			[
				"/read/chapters/low-water",
				"Start with chapter 1: Low water",
				"What the shore shows at the ebb.",
			],
		]);
	});

	it("calls the page built from book.config.ts About this book, at the same address", () => {
		const about = page("read/overview");
		expect(about).toContain("<h1>About this book</h1>");
		expect(about).toContain(`<title>About this book • ${SHORT_TITLE}</title>`);
		expect(page("read")).toContain("About this book</h4>");
		expect(page("")).toContain("<h3>About this book</h3>");
		// The book's own chapter called Overview keeps its name.
		expect(page("read/chapters/overview")).toContain(">Overview</h1>");
	});

	it("says a draft book is a draft on its home page and hub, in the chapter index's words", () => {
		const line = `<strong class="book-draft-note__status">${draftCopy.book}</strong> ${draftCopy.meaning}`;
		expect(page("")).toContain(line);
		expect(page("read")).toContain(line);
		expect(page("read/chapters")).toContain(draftCopy.meaning);
	});

	it("numbers each chapter in the order the index lists, drafts included", () => {
		const index = page("read/chapters");
		expect(index.indexOf("Low water")).toBeLessThan(
			index.indexOf(">Overview<"),
		);
		expect(page("read/chapters/low-water")).toMatch(
			/<div class="eyebrow">Chapter 1 of 2 · draft<\/div>\s*<h1/,
		);
		expect(page("read/chapters/overview")).toContain(
			'<div class="eyebrow">Chapter 2 of 2 · draft</div>',
		);
	});

	it("records chapters for Continue, which the home page and hub hide until there is one", () => {
		expect(page("read/chapters/overview")).toContain(
			'<article data-resume-chapter="overview">',
		);
		for (const path of ["", "read"]) {
			const html = page(path);
			const block = html.match(/<p class="resume-reading"[^>]*>/)?.[0] ?? "";
			expect(block, path).toContain(" hidden");
			expect(block, path).toContain(
				'data-resume-chapters="[{&quot;slug&quot;:&quot;low-water&quot;',
			);
			expect(html, path).toContain("Saved on this device.");
		}
	});

	it("lists the read sections in the menu, marking the one the reader is in", () => {
		expect(sectionMarks(page("read/chapters/low-water"))).toEqual([
			["/read", null],
			["/read/chapters", "true"],
			["/read/mechanisms", null],
			["/read/toolkit", null],
			["/read/glossary", null],
			["/read/examples", null],
		]);
		expect(sectionMarks(page("read/chapters"))[1]).toEqual([
			"/read/chapters",
			"page",
		]);
		expect(sectionMarks(page("read"))[0]).toEqual(["/read", "page"]);
		expect(sectionMarks(page("downloads")).every(([, mark]) => !mark)).toBe(
			true,
		);
	});

	it("titles section indexes with the book's short title, as detail pages are", () => {
		for (const [path, name] of [
			["read", "Read"],
			["read/chapters", "Chapters"],
			["read/mechanisms", "Mechanisms"],
			["read/toolkit", "Toolkit"],
			["read/glossary", "Glossary"],
			["read/examples", "Examples"],
		]) {
			expect(page(path), path).toContain(
				`<title>${name} • ${SHORT_TITLE}</title>`,
			);
		}
		expect(page("read/chapters/low-water")).toContain(
			`<title>Low water • ${SHORT_TITLE}</title>`,
		);
	});
});
