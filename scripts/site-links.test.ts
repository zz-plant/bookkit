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
// Elements that embed a document or submit a form, each to an unsafe
// address: the page keeps only what they contain.
const EMBEDS = [
	'<iframe src="javascript:alert(7)"></iframe>',
	'<object data="javascript:alert(8)">object words</object>',
	'<form action="data:text/html,x">form words</form>',
	'Before <embed src="java&#x09;script:alert(9)" /> after <button formAction="javascript:alert(10)">button words</button>.',
	"<iframe src={target}></iframe>",
	'<form action="javascript:alert(11)"><span><button formAction="javascript:alert(12)">nested words</button></span> [link](javascript:alert(13))</form>',
	'<form action="https://example.com/subscribe"><button formAction="javascript:alert(14)">inner words</button></form>',
];
const KEPT_EMBED = '<iframe src="https://example.com/embed"></iframe>';

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
			"## Embeds",
			"",
			...EMBEDS.flatMap((embed) => [embed, ""]),
			KEPT_EMBED,
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

const attributeValues = (html: string, name: string) =>
	[
		...html.matchAll(
			new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "gi"),
		),
	].map(([, double, single, bare]) => decodeEntities(double ?? single ?? bare));
const hrefs = (html: string) => attributeValues(html, "href");

describe("a page with links that run code or carry a document", () => {
	it("builds", () => {
		expect(build.exitCode, build.output).toBe(0);
	});

	it("links to none of their addresses, and keeps their words", () => {
		expect(hrefs(page).filter((href) => !isSafeLink(href))).toEqual([]);
		expect(page).not.toMatch(/javascript|vbscript|data:text|file:\/\//i);
		expect(page).toContain(`<p>${WORDS.join(" ")}</p>`);
	});

	it("embeds and submits to none of their addresses, and keeps what they contain", () => {
		for (const name of ["src", "data", "action", "formaction"]) {
			expect(
				attributeValues(page, name).filter((value) => !isSafeLink(value)),
				name,
			).toEqual([]);
		}
		expect(page).not.toMatch(/<(object|embed)\b|formaction/i);
		// The ones kept; the iframe with a computed source is left out too.
		expect(page.match(/<iframe\b/g)).toEqual(["<iframe"]);
		expect(page.match(/<form\b[^>]*>/g)).toEqual([
			'<form action="https://example.com/subscribe">',
		]);
		const start = page.indexOf('<h2 id="embeds">');
		const embeds = page.slice(start, page.indexOf("</section>", start));
		expect(embeds).not.toContain("<button");
		for (const words of ["object words", "form words", "link"]) {
			expect(embeds).toContain(`\n${words}\n`);
		}
		expect(embeds).toContain("<span>nested words</span>");
		expect(embeds).toContain(
			'<form action="https://example.com/subscribe">inner words</form>',
		);
		expect(embeds).toContain("<p>Before  after button words.</p>");
		expect(embeds).toContain(KEPT_EMBED);
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
