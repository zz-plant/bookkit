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
// writes them: the page keeps them.
const VIDEOS = [
	'<iframe width="560" height="315" src="https://www.youtube.com/embed/dQw4w9WgXcQ?si=abc" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>',
	'<iframe src="https://player.vimeo.com/video/76979871?h=8272103f6e" width="640" height="360" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>',
	'<iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3022.9!2d-73.98!3d40.75" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>',
];

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
			"## Uncheckable",
			"",
			...UNCHECKABLE.flatMap((line) => [line, ""]),
			"## Videos",
			"",
			...VIDEOS.flatMap((line) => [line, ""]),
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
		const start = page.indexOf('<h2 id="embeds">');
		const embeds = page.slice(start, page.indexOf("<h2", start + 1));
		expect(embeds.match(/<iframe\b/g)).toEqual(["<iframe"]);
		expect(page.match(/<form\b[^>]*>/g)).toEqual([
			'<form action="https://example.com/subscribe">',
		]);
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

	it("leaves out an element with a srcdoc, a spread, an SVG link, or an animated address, keeping what it holds", () => {
		const start = page.indexOf('<h2 id="uncheckable">');
		const section = page.slice(start, page.indexOf("<h2", start + 1));
		expect(start).toBeGreaterThan(-1);
		expect(section).not.toMatch(
			/srcdoc|xlink|<(iframe|animate|set)\b|alert|components=/i,
		);
		for (const words of [
			"spread words",
			"props words",
			"override words",
			"svg words",
			"animated words",
		]) {
			expect(section).toContain(words);
		}
		expect(section).toContain('<a href="https://example.com/svg">');
	});

	it("keeps a video or a map embedded from the web, with its attributes", () => {
		const start = page.indexOf('<h2 id="videos">');
		const section = page.slice(start, page.indexOf("</section>", start));
		expect(
			[...section.matchAll(/<iframe [^>]*>/g)].map(
				([tag]) => tag.match(/src="([^"]*)"/)?.[1],
			),
		).toEqual([
			"https://www.youtube.com/embed/dQw4w9WgXcQ?si=abc",
			"https://player.vimeo.com/video/76979871?h=8272103f6e",
			"https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3022.9!2d-73.98!3d40.75",
		]);
		expect(section).toContain('title="YouTube video player"');
		expect(section).toContain("allowfullscreen");
		expect(section).toContain('referrerpolicy="no-referrer-when-downgrade"');
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
