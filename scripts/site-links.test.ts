import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decodeEntities } from "../packages/astro-bookkit/src/utils/character-references";
import { isSafeLink } from "../packages/astro-bookkit/src/utils/links";
import { buildBook, createBookWorkspace } from "./lib/book-workspace.fixture";
import {
	BUILD_DEADLINE_MS,
	CHILD_DEADLINE_MS,
} from "./lib/child-process.fixture";

/**
 * A real build of a chapter whose links run code or carry a document, written
 * every way #301's export tests write them: the page keeps each link's words
 * and none of those addresses. The book lives in a scratch workspace.
 */

const BOOK = "links-book";

const UNSAFE = [
	"[js](javascript:alert(1))",
	"[upper](JaVaScRiPt:alert(1))",
	"[escaped](&#106;avascript:alert(1))",
	"[vb](vbscript:msgbox(1))",
	"[data](data:text/html;base64,PHNjcmlwdD4=)",
	"[file](file:///etc/passwd)",
	'<a href="javascript:alert(2)">html</a>',
	'<a href="java&#x09;script:alert(3)">tab</a>',
	'<a href=" javascript:alert(4)">space</a>',
	'<a href={"javascript:alert(5)"}>expression</a>',
	"[reference][bad]",
].join(" ");
const WORDS = [
	"js",
	"upper",
	"escaped",
	"vb",
	"data",
	"file",
	"html",
	"tab",
	"space",
	"expression",
	"reference",
];
const SAFE = {
	"https://example.com/": "web",
	"mailto:a@example.com": "mail",
	"/read/chapters/links-probe#links": "inside",
};

let workspace: string;
let page: string;
let build: { exitCode: number | null; output: string };

beforeAll(() => {
	let appDir: string;
	({ workspace, appDir } = createBookWorkspace("site-links-", BOOK));
	writeFileSync(
		join(appDir, "src", "content", "book", "chapters", "99-links.mdx"),
		[
			"---",
			"slug: links-probe",
			"title: Links probe",
			"summary: Links of every kind.",
			"status: draft",
			"---",
			"",
			"## Links",
			"",
			UNSAFE,
			"",
			Object.entries(SAFE)
				.map(([href, text]) => `[${text}](${href})`)
				.join(" "),
			"",
			"[bad]: javascript:alert(6)",
			"",
		].join("\n"),
	);
	build = buildBook(appDir);
	page = readFileSync(
		join(appDir, "dist", "read", "chapters", "links-probe", "index.html"),
		"utf8",
	);
}, BUILD_DEADLINE_MS + CHILD_DEADLINE_MS);

afterAll(() => {
	if (workspace) rmSync(workspace, { recursive: true, force: true });
});

const hrefs = (html: string) =>
	[...html.matchAll(/\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(
		([, double, single, bare]) => decodeEntities(double ?? single ?? bare),
	);

describe("a page with links that run code or carry a document", () => {
	it("builds", () => {
		expect(build.exitCode, build.output).toBe(0);
	});

	it("links to none of their addresses, and keeps their words", () => {
		expect(hrefs(page).filter((href) => !isSafeLink(href))).toEqual([]);
		expect(page).not.toMatch(/javascript|vbscript|data:text|file:\/\//i);
		expect(page).toContain(`<p>${WORDS.join(" ")}</p>`);
	});

	it("keeps its other links", () => {
		const links = [...page.matchAll(/<a [^>]*href="([^"]*)"[^>]*>([^<]*)</g)];
		for (const [href, text] of Object.entries(SAFE)) {
			expect(links.some((link) => link[1] === href && link[2] === text)).toBe(
				true,
			);
		}
	});
});
