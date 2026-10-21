import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pdfPages } from "../packages/astro-bookkit/src/exports/fixtures/pdf-text";
import { inspectEpub } from "../packages/astro-bookkit/src/exports/inspect";
import { decodeEntities } from "../packages/astro-bookkit/src/utils/character-references";
import { UNSAFE_HTML } from "../packages/astro-bookkit/src/utils/fixtures/unsafe-html";
import {
	attributeRefusal,
	CONTENT_ELEMENTS,
} from "../packages/astro-bookkit/src/utils/html-allowlist";
import { isSafeLink } from "../packages/astro-bookkit/src/utils/links";
import { buildBook, createBookWorkspace } from "./lib/book-workspace.fixture";
import { pageContentFindings } from "./lib/build-output";
import {
	BUILD_DEADLINE_MS,
	CHILD_DEADLINE_MS,
} from "./lib/child-process.fixture";

/**
 * A real build of a chapter whose links run code or carry a document,
 * written every way #301's export tests write them, and whose raw HTML runs
 * script, styles the page, or poses as the reader UI every way found
 * (utils/fixtures/unsafe-html.ts): the page keeps each link's words and the
 * text the HTML holds, and nothing that runs. So do the chapter's PDF and
 * EPUB. The book lives in a scratch workspace.
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
// Attributes no address check can vouch for: a document in srcdoc, a spread,
// SVG's xlink:href, and an animation that rewrites a link's address.
const UNCHECKABLE = [
	'<iframe srcdoc="<script>alert(15)</script>"></iframe>',
	'<iframe src="https://example.com/frame" srcDoc={"<script>alert(16)</script>"}></iframe>',
	'<iframe {...{ src: "javascript:alert(17)" }}></iframe>',
	'<a {...{ href: "javascript:alert(18)" }}>spread words</a> <a {...props}>props words</a> <a href="https://example.com/" {...{ href: "javascript:alert(19)" }}>override words</a>',
	'<svg><a xlink:href="javascript:alert(20)"><text>svg words</text></a></svg>',
	'<svg><a href="https://example.com/svg"><animate attributeName="href" values="javascript:alert(21)" /><set attributeName={name} to="javascript:alert(22)" /><text>animated words</text></a></svg>',
];
// Embeds as YouTube, Vimeo, and Google Maps hand them out, the way import
// writes them: the page keeps them, but for Google Maps' style.
const VIDEOS = [
	'<iframe width="560" height="315" src="https://www.youtube.com/embed/dQw4w9WgXcQ?si=abc" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>',
	'<iframe src="https://player.vimeo.com/video/76979871?h=8272103f6e" width="640" height="360" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>',
	'<iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3022.9!2d-73.98!3d40.75" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>',
];

let workspace: string;
let page: string;
let epub: Uint8Array;
let pdf: Uint8Array;
let build: { exitCode: number | null; output: string };

beforeAll(() => {
	let appDir: string;
	({ workspace, appDir } = createBookWorkspace("site-html-", BOOK));
	writeFileSync(
		join(appDir, "src", "content", "book", "chapters", "99-links.mdx"),
		[
			"---",
			"slug: links-probe",
			// The title reaches the page's structured data, in a <script>.
			'title: "Links probe </script><script>alert(0)</script>"',
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
			"## Uncheckable",
			"",
			...UNCHECKABLE.flatMap((line) => [line, ""]),
			"## Videos",
			"",
			...VIDEOS.flatMap((line) => [line, ""]),
			"## Raw HTML",
			"",
			...UNSAFE_HTML.flatMap(({ mdx }) => [mdx, ""]),
			// What the site's own Markdown writes beyond what raw HTML may.
			"## Markdown",
			"",
			"```ts",
			"const total = 1 < 2;",
			"```",
			"",
			"A note.[^1]",
			"",
			"- [x] done",
			"- [ ] to do",
			"",
			"| Left | Right |",
			"| :- | -: |",
			"| 1 | 2 |",
			"",
			"[^1]: The note.",
			"",
			"## End",
			"",
		].join("\n"),
	);
	build = buildBook(appDir);
	const dist = join(appDir, "dist");
	page = readFileSync(
		join(dist, "read", "chapters", "links-probe", "index.html"),
		"utf8",
	);
	epub = readFileSync(join(dist, "exports", "chapters", "links-probe.epub"));
	pdf = readFileSync(join(dist, "exports", "chapters", "links-probe.pdf"));
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

/** The part of the page between a heading and the next. */
const section = (id: string) => {
	const start = page.indexOf(`<h2 id="${id}">`);
	expect(start).toBeGreaterThan(-1);
	return page.slice(start, page.indexOf("<h2", start + 1));
};

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
		// The embed kept; the one with a computed source is left out too, and
		// a form goes whatever its address, keeping what it holds.
		const embeds = section("embeds");
		expect(embeds).not.toMatch(/<(object|embed|form|button)\b|formaction/i);
		expect(embeds.match(/<iframe\b/g)).toEqual(["<iframe"]);
		for (const words of ["object words", "form words", "link", "inner words"]) {
			expect(embeds).toContain(`\n${words}\n`);
		}
		expect(embeds).toContain("<span>nested words</span>");
		expect(embeds).toContain("<p>Before  after button words.</p>");
		expect(embeds).toContain(KEPT_EMBED);
	});

	it("leaves out a srcdoc, a spread, an SVG link, or an animated address, keeping what they hold", () => {
		const uncheckable = section("uncheckable");
		// The embed with a web address stays, without its srcdoc.
		expect(uncheckable.match(/<iframe [^>]*>/g)).toEqual([
			'<iframe src="https://example.com/frame">',
		]);
		expect(uncheckable).not.toMatch(
			/srcdoc|xlink|<(animate|set|svg)\b|alert|components=/i,
		);
		for (const words of [
			"spread words",
			"props words",
			"override words",
			"svg words",
			"animated words",
		]) {
			expect(uncheckable).toContain(words);
		}
		expect(uncheckable).toContain('<a href="https://example.com/svg">');
	});

	it("keeps a video or a map embedded from the web, with its attributes", () => {
		const videos = section("videos");
		expect(
			[...videos.matchAll(/<iframe [^>]*>/g)].map(
				([tag]) => tag.match(/src="([^"]*)"/)?.[1],
			),
		).toEqual([
			"https://www.youtube.com/embed/dQw4w9WgXcQ?si=abc",
			"https://player.vimeo.com/video/76979871?h=8272103f6e",
			"https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3022.9!2d-73.98!3d40.75",
		]);
		expect(videos).toContain('title="YouTube video player"');
		expect(videos).toContain("allowfullscreen");
		expect(videos).toContain('referrerpolicy="no-referrer-when-downgrade"');
		expect(videos).not.toContain("style=");
	});

	it("keeps none of the raw HTML that runs script, styles the page, or poses as its UI, and keeps its words", () => {
		const html = section("raw-html");
		expect(html).not.toContain("alert");
		for (const { attack, keeps } of UNSAFE_HTML) {
			if (keeps) expect(html, attack).toContain(keeps);
		}
		// Every element and attribute left is one the allowlist keeps.
		for (const [, element, attributes] of html.matchAll(
			/<([a-zA-Z][\w:-]*)(\s[^<>]*?)?\/?>/g,
		)) {
			expect(CONTENT_ELEMENTS.has(element), element).toBe(true);
			for (const [, name, double, single] of (attributes ?? "").matchAll(
				/\s([^\s"'=/>]+)(?:="([^"]*)"|='([^']*)')?/g,
			)) {
				const value = decodeEntities(double ?? single ?? "");
				expect(
					attributeRefusal(element, name, value),
					`<${element} ${name}="${value}">`,
				).toBe(null);
			}
		}
	});

	it("passes check:build's check of its content, with what Markdown writes", () => {
		expect(page).toContain('<pre class="astro-code');
		expect(page).toContain("data-footnote-ref");
		expect(page).toContain('<input type="checkbox" checked disabled');
		expect(page).toContain('<th style="text-align:right">');
		expect(
			pageContentFindings("read/chapters/links-probe/index.html", page),
		).toEqual([]);
	});

	it("keeps a title's </script> from ending the page's structured data", () => {
		// Each script's text runs to the first </script>: whole JSON only when
		// the title's is escaped.
		const scripts = [
			...page.matchAll(
				/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
			),
		].map(([, json]) => JSON.parse(json));
		expect(scripts.length).toBeGreaterThan(0);
		expect(JSON.stringify(scripts)).toContain(
			"Links probe </script><script>alert(0)</script>",
		);
	});

	it("leaves the chapter's EPUB and PDF with the same, and nothing that runs", async () => {
		expect(await inspectEpub(epub)).toEqual([]);
		const pdfText = (await pdfPages(pdf)).join("\n");
		expect(pdfText).toContain("form words");
		expect(pdfText.replaceAll("alert(0)", "")).not.toContain("alert");
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
