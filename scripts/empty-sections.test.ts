import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { buildBook, createBookWorkspace } from "./lib/book-workspace.fixture";

/**
 * A new book from the starter, with no toolkit actions, glossary terms, or
 * examples yet, and no mechanisms listed in book.config.ts (the starter's
 * `mechanisms: []`). It builds on the starter's defaults alone (no
 * localization or previewAccess block), and each empty section says so
 * instead of showing a list's tools over nothing: the index pages, the
 * reading hub's cards, the home page's counts, and About this book.
 */

const BOOK = "empty-sections";

let workspace: string;
let appDir: string;
let build: { exitCode: number | null; output: string };

const page = (path: string) =>
	readFileSync(join(appDir, "dist", path, "index.html"), "utf8");

beforeAll(() => {
	({ workspace, appDir } = createBookWorkspace("empty-sections-", BOOK));
	const content = join(appDir, "src", "content", "book");
	for (const section of ["toolkit", "glossary", "examples"]) {
		for (const entry of readdirSync(join(content, section))) {
			rmSync(join(content, section, entry), { recursive: true });
		}
	}
	build = buildBook(appDir);
}, 240_000);

afterAll(() => rmSync(workspace, { recursive: true, force: true }));

describe("a book with empty sections", () => {
	it("builds", () => {
		expect(build.exitCode, build.output).toBe(0);
	});

	it("says an index is empty, with no list tools", () => {
		for (const [path, message] of [
			["read/toolkit", "No toolkit actions yet."],
			["read/glossary", "No glossary terms yet."],
			["read/examples", "No examples yet."],
		]) {
			const html = page(path);
			expect(html).toContain(`<div class="list-empty"><p>${message}</p>`);
			expect(html).not.toContain("list-tools");
			expect(html).not.toContain("data-list-container");
			expect(html).not.toContain("Nothing matches that filter.");
		}
	});

	it("keeps a section that has entries as a list", () => {
		const html = page("read/mechanisms");
		expect(html).toContain("data-list-container");
		expect(html).not.toContain('class="list-empty"><p>');
		expect(html).toContain("<h2>Then pick an action</h2>");
	});

	it("marks the hub's empty sections and leaves them out of the home page's counts", () => {
		const hub = page("read");
		const card = (key: string) => {
			const start = hub.indexOf(`data-section-key="${key}"`);
			return hub.slice(start, hub.indexOf("</a>", start));
		};
		expect(card("toolkit")).toContain('<p class="meta">None yet.</p>');
		expect(card("chapters")).not.toContain("None yet.");

		const home = page("");
		const inside = home.slice(home.indexOf("<h2>What’s inside</h2>"));
		expect(inside).toContain('<div class="stat-label">Chapters</div>');
		expect(inside).not.toContain("Toolkit actions");
		expect(inside).not.toContain("Glossary terms");
	});

	it("leaves Core mechanisms off About this book until book.config.ts lists one", () => {
		const html = page("read/overview");
		expect(html).toContain("<h2>Core claim</h2>");
		expect(html).not.toContain("Core mechanisms");
	});
});
