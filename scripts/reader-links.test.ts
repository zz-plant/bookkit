import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { parseFrontmatter } from "../packages/astro-bookkit/src/utils/frontmatter";
import { repoRoot } from "./_lib";
import { copyBooks } from "./lib/book-workspace.fixture";
import { BUILD_DEADLINE_MS, runChildAsync } from "./lib/child-process.fixture";

/**
 * The read UI links every pair of pages the book's frontmatter connects, in
 * both directions: a chapter and the mechanisms it lists, a mechanism and the
 * glossary terms that name it, an action and its mechanism's chapters and
 * examples. Built with the shared templates, as a reader sees them; the
 * expected links are read from each book's content files, so the test holds
 * for any content. on-call has prerequisites and glossary `mechanisms`;
 * bad-people has two releases. It builds copies of the books, since
 * static-build.test.ts builds apps/on-call at the same time.
 */

const BOOKS = ["on-call", "bad-people"] as const;
type Book = (typeof BOOKS)[number];

const logs = new Map<Book, string>();
const exitCodes = new Map<Book, number | null>();
let workspace: string;
let appDir: (book: string) => string;

beforeAll(async () => {
	({ workspace, appDir } = copyBooks("reader-links-", BOOKS));
	await Promise.all(
		BOOKS.map(async (book) => {
			const build = await runChildAsync([process.execPath, "run", "build"], {
				cwd: appDir(book),
				env: { ...process.env, NO_COLOR: "1" },
				deadlineMs: BUILD_DEADLINE_MS,
			});
			exitCodes.set(book, build.status);
			logs.set(book, build.output);
		}),
	);
}, 240_000);

afterAll(() => {
	if (workspace) rmSync(workspace, { recursive: true, force: true });
});

type Record_ = { slug: string; data: Record<string, unknown> };

/** A section's records from the book's content files; examples are keyed by file name. */
const records = (book: Book, section: string): Record_[] => {
	const dir = join(repoRoot(), "apps", book, "src", "content", "book", section);
	const files = readdirSync(dir, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && /\.mdx?$/.test(entry.name))
		.map((entry) => join(entry.parentPath, entry.name));
	return files.map((file) => {
		const { data } = parseFrontmatter(readFileSync(file, "utf8"));
		const fromFile = basename(file).replace(/\.mdx?$/, "");
		return {
			slug: section === "examples" ? fromFile : String(data.slug ?? fromFile),
			data,
		};
	});
};

const list = (value: unknown): string[] =>
	Array.isArray(value) ? value.map(String) : [];

const page = (book: Book, path: string): string =>
	readFileSync(
		join(
			appDir(book),
			"dist",
			...path.split("/").filter(Boolean),
			"index.html",
		),
		"utf8",
	);

/** The HTML from the page's <main> to its end, without the header or footer. */
const main = (html: string): string =>
	html.slice(html.indexOf("<main"), html.indexOf("</main>"));

const hrefs = (html: string): string[] =>
	[...html.matchAll(/<a [^>]*href="([^"]+)"/g)].map((match) => match[1]);

/** The links outside the chapter's previous/next cards. */
const linksBesidePagination = (html: string): string[] =>
	hrefs(
		main(html).replace(/<nav class="chapter-pagination"[\s\S]*?<\/nav>/, ""),
	);

describe.each(BOOKS)("%s", (book) => {
	it("builds", () => {
		expect(exitCodes.get(book), logs.get(book)).toBe(0);
	});

	const chapters = () => records(book, "chapters");
	const mechanisms = () => records(book, "mechanisms");
	const toolkit = () => records(book, "toolkit");
	const examples = () => records(book, "examples");
	const glossary = () => records(book, "glossary");
	const actionsFor = (mechanism: string) =>
		toolkit().filter((tool) => tool.data.mechanism === mechanism);

	it("lists, on each mechanism page, the chapters that use it and the glossary terms that name it", () => {
		let expected = 0;
		for (const mechanism of mechanisms()) {
			const links = hrefs(
				main(page(book, `/read/mechanisms/${mechanism.slug}/`)),
			);
			for (const chapter of chapters().filter((c) =>
				list(c.data.mechanisms).includes(mechanism.slug),
			)) {
				expected++;
				expect(links, `${mechanism.slug} → ${chapter.slug}`).toContain(
					`/read/chapters/${chapter.slug}`,
				);
			}
			for (const term of glossary().filter((g) =>
				list(g.data.mechanisms).includes(mechanism.slug),
			)) {
				expected++;
				expect(links, `${mechanism.slug} → ${term.slug}`).toContain(
					`/read/glossary/${term.slug}`,
				);
			}
		}
		expect(expected).toBeGreaterThan(0);
	});

	it("shows each chapter's prerequisites, and the actions for its mechanisms under Keep going", () => {
		for (const chapter of chapters()) {
			const html = page(book, `/read/chapters/${chapter.slug}/`);
			const links = linksBesidePagination(html);
			for (const prerequisite of list(chapter.data.prerequisites)) {
				expect(links, `${chapter.slug} reads ${prerequisite} first`).toContain(
					`/read/chapters/${prerequisite}`,
				);
			}
			const keepGoing = hrefs(
				html.slice(html.indexOf('<section class="next-steps"')),
			);
			for (const mechanism of list(chapter.data.mechanisms)) {
				for (const action of actionsFor(mechanism)) {
					expect(keepGoing, `${chapter.slug} → ${action.slug}`).toContain(
						`/read/toolkit/${action.slug}`,
					);
				}
			}
		}
	});

	it("links each action to the examples and chapters of its mechanism, and gives its sections ids", () => {
		for (const action of toolkit()) {
			const html = main(page(book, `/read/toolkit/${action.slug}/`));
			const links = hrefs(html);
			const mechanism = String(action.data.mechanism);
			for (const example of examples().filter(
				(e) => e.data.mechanism === mechanism,
			)) {
				expect(links, `${action.slug} → ${example.slug}`).toContain(
					`/read/examples/${example.slug}`,
				);
			}
			for (const chapter of chapters().filter((c) =>
				list(c.data.mechanisms).includes(mechanism),
			)) {
				expect(links, `${action.slug} → ${chapter.slug}`).toContain(
					`/read/chapters/${chapter.slug}`,
				);
			}
			// The procedure's own sections, before the "Keep going" panel.
			const procedure = html.slice(
				0,
				html.indexOf('<section class="next-action-panel'),
			);
			const headings = [...procedure.matchAll(/<h2([^>]*)>/g)].map((m) => m[1]);
			expect(headings.length, action.slug).toBeGreaterThan(0);
			for (const attributes of headings) {
				expect(attributes, action.slug).toMatch(/\bid="[a-z-]+"/);
			}
		}
	});

	it("names each example's mechanism by its title and links the actions for it", () => {
		for (const example of examples()) {
			const html = main(page(book, `/read/examples/${example.slug}/`));
			const mechanism = mechanisms().find(
				(m) => m.slug === example.data.mechanism,
			);
			expect(mechanism, example.slug).toBeDefined();
			expect(html, example.slug).toContain(
				`<a href="/read/mechanisms/${mechanism?.slug}">${mechanism?.data.title}</a>`,
			);
			expect(html, example.slug).not.toContain(
				`The ${mechanism?.slug} mechanism`,
			);
			for (const action of actionsFor(String(example.data.mechanism))) {
				expect(hrefs(html), `${example.slug} → ${action.slug}`).toContain(
					`/read/toolkit/${action.slug}`,
				);
			}
		}
	});

	it("links each glossary term to the mechanisms it names, after its definition", () => {
		for (const term of glossary()) {
			const html = main(page(book, `/read/glossary/${term.slug}/`));
			const declared = list(term.data.mechanisms);
			const named = declared.length > 0 ? declared : [term.slug];
			const panel = html.indexOf('<section class="next-action-panel');
			expect(panel, term.slug).toBeGreaterThan(html.indexOf("content-block"));
			for (const mechanism of named.filter((slug) =>
				mechanisms().some((m) => m.slug === slug),
			)) {
				expect(
					hrefs(html.slice(panel)),
					`${term.slug} → ${mechanism}`,
				).toContain(`/read/mechanisms/${mechanism}`);
			}
		}
	});

	it("marks Reading hub and Read as the current page only on the hub", () => {
		const current = (html: string) =>
			[...html.matchAll(/<a [^>]*href="\/read"[^>]*>/g)]
				.map((match) => match[0].match(/aria-current="([^"]+)"/)?.[1])
				.filter(Boolean);
		expect(current(page(book, "/read/"))).toEqual(["page", "page"]);
		const chapter = chapters()[0]?.slug;
		const html = page(book, `/read/chapters/${chapter}/`);
		// The header link and the phone bar mark the section; the breadcrumb's last item is the page.
		expect(current(html)).toEqual(["true", "true"]);
		expect(html).toMatch(/<nav class="breadcrumb"[\s\S]*?aria-current="page"/);
	});
});

describe("release notes and the version archive (bad-people, two releases)", () => {
	it("links each changed section in the release notes to that section", () => {
		const html = main(page("bad-people", "/release-notes/"));
		const changed = [
			...html.matchAll(/<p class="meta">\s*Changed:([\s\S]*?)<\/p>/g),
		];
		expect(changed.length).toBeGreaterThan(0);
		for (const [, line] of changed) {
			const sections = hrefs(line);
			expect(sections.length).toBeGreaterThan(0);
			for (const href of sections) {
				expect(href).toMatch(
					/^\/read\/(overview|chapters|mechanisms|toolkit|glossary|examples)$/,
				);
			}
		}
	});

	it("links an older version to its release notes, since a static build has no /v/ pages", () => {
		const archive = hrefs(main(page("bad-people", "/versions/")));
		expect(archive.filter((href) => href.startsWith("/v/"))).toEqual([]);
		const notes = page("bad-people", "/release-notes/");
		const older = archive.filter((href) => href.startsWith("/release-notes#"));
		expect(older.length).toBeGreaterThan(0);
		for (const href of older) {
			expect(notes).toContain(`id="${href.split("#")[1]}"`);
		}
	});
});
