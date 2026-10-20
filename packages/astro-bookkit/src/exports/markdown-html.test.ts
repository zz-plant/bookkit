import { afterAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KEPT_ELEMENTS } from "../utils/markdown";
import { createEpubExport } from "./epub-generator";
import {
	articleBody,
	chaptersBundle,
	EPUBCHECK_CLEAN,
	epubChapter,
	epubcheck,
	missingInOrder,
	pdfPages,
} from "./fixtures/pdf-text";
import { extractPdfText, inspectEpub, inspectPdf } from "./inspect";
import { markdownToHtml } from "./markdown-to-html";
import { createPdfExport } from "./pdf-generator";

/**
 * Raw HTML in a chapter: the elements import keeps (KEPT_ELEMENTS), which
 * the site renders, are rendered by the EPUB as valid XHTML and by the PDF
 * with print equivalents. Any other tag is left out and its text kept.
 */

const scratch = mkdtempSync(join(tmpdir(), "bookkit-markdown-html-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** Each kept element, as an author writes it, and the XHTML the EPUB shows for it. */
const EPUB_CASES: Array<[string, string, string]> = [
	[
		"kbd",
		"Press <kbd>Ctrl</kbd>+<kbd>K</kbd>.",
		"<p>Press <kbd>Ctrl</kbd>+<kbd>K</kbd>.</p>",
	],
	["b", "A <b>bold</b> word.", "<p>A <b>bold</b> word.</p>"],
	[
		"strong",
		"A <strong>strong</strong> word.",
		"<p>A <strong>strong</strong> word.</p>",
	],
	["i", "An <i>italic</i> word.", "<p>An <i>italic</i> word.</p>"],
	["em", "An <em>emphasized</em> word.", "<p>An <em>emphasized</em> word.</p>"],
	["u", "An <u>underlined</u> word.", "<p>An <u>underlined</u> word.</p>"],
	["s", "A <s>struck</s> word.", "<p>A <s>struck</s> word.</p>"],
	["del", "A <del>deleted</del> word.", "<p>A <del>deleted</del> word.</p>"],
	[
		"ins",
		"An <ins>inserted</ins> word.",
		"<p>An <ins>inserted</ins> word.</p>",
	],
	["mark", "A <mark>marked</mark> word.", "<p>A <mark>marked</mark> word.</p>"],
	[
		"small",
		"A <small>small</small> word.",
		"<p>A <small>small</small> word.</p>",
	],
	[
		"span",
		'A <span class="x" onclick="steal()">span</span>.',
		"<p>A <span>span</span>.</p>",
	],
	["sub", "H<sub>2</sub>O", "<p>H<sub>2</sub>O</p>"],
	["sup", "x<sup>2</sup>", "<p>x<sup>2</sup></p>"],
	["cite", "<cite>The Book</cite>", "<p><cite>The Book</cite></p>"],
	["dfn", "A <dfn>handoff</dfn> is", "<p>A <dfn>handoff</dfn> is</p>"],
	["var", "Set <var>n</var>.", "<p>Set <var>n</var>.</p>"],
	["samp", "It prints <samp>OK</samp>.", "<p>It prints <samp>OK</samp>.</p>"],
	["code", "Run <code>make</code>.", "<p>Run <code>make</code>.</p>"],
	["q", "She said <q>wait</q>.", "<p>She said <q>wait</q>.</p>"],
	[
		"abbr",
		'<abbr title="Service level">SLA</abbr>',
		'<p><abbr title="Service level">SLA</abbr></p>',
	],
	[
		"time",
		'<time datetime="2026-03-02">March 2</time>, <time>later</time>',
		'<p><time datetime="2026-03-02">March 2</time>, later</p>',
	],
	[
		"a",
		'<a href="https://example.com/x">a link</a> and <a name="old">an anchor</a>',
		'<p><a href="https://example.com/x">a link</a> and <span>an anchor</span></p>',
	],
	[
		"br",
		"Line one<br>line two<br/>line three",
		"<p>Line one<br/>line two<br/>line three</p>",
	],
	["wbr", "long<wbr>word", "<p>longword</p>"],
	[
		"img",
		'<img src="/images/board.png" alt="The board" width=200>',
		'<p><img src="/images/board.png" alt="The board"/></p>',
	],
	[
		"picture",
		'<picture><source srcset="/b.webp"><img src="/b.png" alt="B"></picture>',
		'<p><img src="/b.png" alt="B"/></p>',
	],
	[
		"p",
		'<p align="center">Centered <b>text</b></p>',
		'<p class="align-center">Centered <b>text</b></p>',
	],
	["h1", "<h1>Big</h1>", "<h1>Big</h1>"],
	["h2", '<h2 align="center">An HTML heading</h2>', "<h2>An HTML heading</h2>"],
	["h3", "<h3>Third</h3>", "<h3>Third</h3>"],
	["h4", "<h4>Fourth</h4>", "<h4>Fourth</h4>"],
	["h5", "<h5>Fifth</h5>", "<h5>Fifth</h5>"],
	["h6", "<h6>Sixth</h6>", "<h6>Sixth</h6>"],
	["hr", "Above\n\n<hr>\n\nBelow", "<p>Above</p>\n<hr/>\n<p>Below</p>"],
	[
		"details",
		"<details>\n<summary>Timeline</summary>\n\n- 02:10 pager\n- 04:15 resolved\n\n</details>",
		'<div class="details"><p class="details__summary"><strong>Timeline</strong></p><ul><li>02:10 pager</li><li>04:15 resolved</li></ul></div>',
	],
	["summary", "<summary>Out of place</summary>", "<p>Out of place</p>"],
	[
		"div",
		'<div align="right">\nText **bold**\n</div>',
		'<div class="align-right"><p>Text <strong>bold</strong></p></div>',
	],
	[
		"center",
		"<center>Old center</center>",
		'<div class="align-center"><p>Old center</p></div>',
	],
	[
		"section",
		"<section>\nSection text\n</section>",
		"<section><p>Section text</p></section>",
	],
	[
		"article",
		"<article>Article text</article>",
		"<article><p>Article text</p></article>",
	],
	["aside", "<aside>Aside text</aside>", "<aside><p>Aside text</p></aside>"],
	["header", "<header>Header text</header>", "<div><p>Header text</p></div>"],
	["footer", "<footer>Footer text</footer>", "<div><p>Footer text</p></div>"],
	[
		"blockquote",
		"<blockquote>Quoted</blockquote>",
		"<blockquote><p>Quoted</p></blockquote>",
	],
	[
		"figure",
		'<figure>\n<img src="/f.png" alt="F">\n<figcaption>The caption</figcaption>\n</figure>',
		'<figure><p><img src="/f.png" alt="F"/></p><figcaption>The caption</figcaption></figure>',
	],
	[
		"figcaption",
		"<figcaption>Loose caption</figcaption>",
		"<p>Loose caption</p>",
	],
	[
		"dl",
		"<dl>\n<dt>Owner</dt>\n<dd>The person paged first.</dd>\n</dl>",
		"<dl><dt>Owner</dt><dd><p>The person paged first.</p></dd></dl>",
	],
	["dt", "<dt>Loose term</dt>", "<p>Loose term</p>"],
	["dd", "<dd>Loose description</dd>", "<p>Loose description</p>"],
	[
		"ul",
		"<ul>\n<li>One</li>\n<li>Two <b>bold</b></li>\n</ul>",
		"<ul><li>One</li><li>Two <b>bold</b></li></ul>",
	],
	[
		"ol",
		'<ol start="3"><li>Three</li><li>Four</li></ol>',
		'<ol start="3"><li>Three</li><li>Four</li></ol>',
	],
	["li", "<li>Loose item</li>", "<p>Loose item</p>"],
	[
		"table",
		'<table>\n<caption>Pager load</caption>\n<colgroup><col></colgroup>\n<thead><tr><th align="right">N</th><th>Signal</th></tr></thead>\n<tbody><tr><td>1</td><td>Pager</td></tr></tbody>\n<tfoot><tr><td>2</td><td>Total</td></tr></tfoot>\n</table>',
		'<table><caption>Pager load</caption><thead><tr><th class="align-right">N</th><th>Signal</th></tr></thead><tbody><tr><td class="align-right">1</td><td>Pager</td></tr><tr><td class="align-right">2</td><td>Total</td></tr></tbody></table>',
	],
	[
		"tr",
		"<table><tr><td>a</td><td>b</td></tr><tr><td>c</td></tr></table>",
		"<table><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td></td></tr></tbody></table>",
	],
	["td", "<td>Loose cell</td>", "<p>Loose cell</p>"],
	["th", "<th>Loose header</th>", "<p>Loose header</p>"],
	["thead", "<thead><tr><td>Loose row</td></tr></thead>", "<p>Loose row</p>"],
	["tbody", "<tbody>Loose body</tbody>", "<p>Loose body</p>"],
	["tfoot", "<tfoot>Loose foot</tfoot>", "<p>Loose foot</p>"],
	["caption", "<caption>Loose caption</caption>", "<p>Loose caption</p>"],
	[
		"colgroup",
		"Before <colgroup><col></colgroup> after",
		"<p>Before</p>\n<p>after</p>",
	],
	["col", "Before <col> after", "<p>Before  after</p>"],
	["source", 'Before <source src="/a.webp"> after', "<p>Before  after</p>"],
];

/** Tags outside the allowlist: left out, their text kept. */
const DROPPED_CASES: Array<[string, string]> = [
	["<script>alert(1)</script> stays text", "<p>alert(1) stays text</p>"],
	['<font color="red">red</font> words', "<p>red words</p>"],
	[
		'<Callout type="warning">\nCheck the owner.\n</Callout>',
		"<p>Check the owner.</p>",
	],
	["<Aside />\n\nNext paragraph.", "<p>Next paragraph.</p>"],
	["<p><div>A block in a paragraph</div></p>", "<p>A block in a paragraph</p>"],
	["<ul><p>Not an item</p></ul>", "<p>Not an item</p>"],
	["<dl><dd>No term</dd></dl>", "<p>No term</p>"],
	[
		"Unclosed <kbd>key and </b>stray close",
		"<p>Unclosed key and stray close</p>",
	],
	["**a <kbd>b** c</kbd>", "<p>**a <kbd>b** c</kbd></p>"],
	[
		"`<kbd>` in code and \\<kbd\\> escaped",
		"<p><code>&lt;kbd&gt;</code> in code and &lt;kbd&gt; escaped</p>",
	],
];

describe("HTML import keeps, in the EPUB", () => {
	it("covers every element import keeps", () => {
		expect(EPUB_CASES.map(([name]) => name).sort()).toEqual(
			[...KEPT_ELEMENTS].sort(),
		);
	});

	for (const [name, markdown, xhtml] of EPUB_CASES) {
		it(`renders <${name}>`, () => {
			expect(markdownToHtml(markdown)).toBe(xhtml);
		});
	}

	it("leaves out other tags and keeps their text", () => {
		for (const [markdown, xhtml] of DROPPED_CASES) {
			expect(markdownToHtml(markdown)).toBe(xhtml);
		}
	});

	it("links an HTML link through the book's link resolver, and never nests links", () => {
		expect(
			markdownToHtml(
				'<a href="/read/chapters/b">B</a> and [outer <a href="https://x.test">inner</a>](https://y.test)',
				(href) => (href.startsWith("/") ? "chapter-b.xhtml" : href),
			),
		).toBe(
			'<p><a href="chapter-b.xhtml">B</a> and <a href="https://y.test">outer inner</a></p>',
		);
	});

	it("is valid XHTML, and passes epubcheck when it is available", async () => {
		const body = [
			...EPUB_CASES.map(([, markdown]) => markdown),
			...DROPPED_CASES.map(([markdown]) => markdown),
		].join("\n\n");
		const epub = await createEpubExport(chaptersBundle([["html", body]]), {
			loadImage: () => ({ problem: "is a test image", fix: "none" }),
			onWarning: () => {},
		});
		expect(await inspectEpub(epub)).toEqual([]);
		expect(articleBody(await epubChapter(epub, "html"))).toContain(
			'<div class="details">',
		);
		if (process.env.EPUBCHECK_JAR) {
			expect(epubcheck(epub, scratch, "html")).toContain(EPUBCHECK_CLEAN);
		}
	}, 60_000);
});

describe("HTML import keeps, in the PDF", () => {
	const runsOf = async (markdown: string) => {
		const pdf = await createPdfExport(chaptersBundle([["html", markdown]]), {
			loadImage: () => ({ problem: "is a test image", fix: "none" }),
			onWarning: () => {},
		});
		expect(await inspectPdf(pdf)).toEqual([]);
		// The chapter's runs, after its title.
		const runs = (await extractPdfText(pdf)).flat();
		return runs.slice(runs.findIndex((run) => run.text === "html") + 1);
	};
	/** The font of the run that is `text`, or that holds it among plain words. */
	const fontOf = (runs: Array<{ text: string; font: string }>, text: string) =>
		(
			runs.find((run) => run.text === text) ??
			runs.find((run) => run.text.split(" ").includes(text))
		)?.font;

	it("draws keys, sample output, and code in Courier; bold and italic elements in their faces", async () => {
		const runs = await runsOf(
			"<kbd>Ctrl</kbd> <samp>OK</samp> <code>make</code> <b>b</b> <strong>strong</strong> <i>i</i> <em>em</em> <cite>cite</cite> <dfn>dfn</dfn> <var>var</var> <b><i>both</i></b> <mark>mark</mark> <u>u</u>",
		);
		expect(
			Object.fromEntries(
				[
					"Ctrl",
					"OK",
					"make",
					"b",
					"strong",
					"i",
					"em",
					"cite",
					"dfn",
					"var",
					"both",
					"mark",
					"u",
				].map((text) => [text, fontOf(runs, text)]),
			),
		).toEqual({
			Ctrl: "Courier",
			OK: "Courier",
			make: "Courier",
			b: "Helvetica-Bold",
			strong: "Helvetica-Bold",
			i: "Helvetica-Oblique",
			em: "Helvetica-Oblique",
			cite: "Helvetica-Oblique",
			dfn: "Helvetica-Oblique",
			var: "Helvetica-Oblique",
			both: "Helvetica-BoldOblique",
			mark: "Helvetica",
			u: "Helvetica",
		});
	});

	it("raises <sup>, lowers <sub>, quotes <q>, and breaks the line at <br>", async () => {
		const runs = await runsOf(
			"x<sup>2</sup> H<sub>2</sub>O <q>wait</q> one<br>two",
		);
		const x = runs.find((run) => run.text === "x");
		const [sup, sub] = runs.filter((run) => run.text === "2");
		expect(sup.y).toBeGreaterThan(x?.y ?? 0);
		expect(sub.y).toBeLessThan(x?.y ?? 0);
		const text = runs.map((run) => run.text).join("");
		expect(text).toContain("“wait”");
		const one = runs.find((run) => run.text.endsWith("one"));
		const two = runs.find((run) => run.text === "two");
		expect(two?.y).toBeLessThan(one?.y ?? 0);
	});

	it("shows a <details> as its summary in bold, then its content; ignores align; keeps out other tags", async () => {
		const runs = await runsOf(
			[
				"<details>\n<summary>Timeline</summary>\n\n- 02:10 pager\n\n</details>",
				'<p align="center">Centered</p>',
				"<dl>\n<dt>Owner</dt>\n<dd>The person paged first.</dd>\n</dl>",
				"<table><tr><th>Signal</th></tr><tr><td>Pager</td></tr></table>",
				"<figure>\n<figcaption>The caption</figcaption>\n</figure>",
				"<hr>",
				"<script>alert(1)</script> stays text",
			].join("\n\n"),
		);
		expect(fontOf(runs, "Timeline")).toBe("Helvetica-Bold");
		expect(fontOf(runs, "Owner")).toBe("Helvetica-Bold");
		expect(fontOf(runs, "The caption")).toBe("Helvetica-Oblique");
		// Alignment is ignored: the paragraph starts at the margin, as the summary does.
		expect(runs.find((run) => run.text === "Centered")?.x).toBe(
			runs.find((run) => run.text === "Timeline")?.x,
		);
		const description = runs.find(
			(run) => run.text === "The person paged first.",
		);
		expect(description?.x).toBeGreaterThan(
			runs.find((run) => run.text === "Owner")?.x ?? 0,
		);
		expect(
			missingInOrder(runs.map((run) => run.text).join("|"), [
				"Timeline",
				"02:10 pager",
				"Centered",
				"Owner",
				"The person paged first.",
				"Signal",
				"Pager",
				"The caption",
				"alert(1) stays text",
			]),
		).toEqual([]);
		expect(
			(
				await pdfPages(
					await createPdfExport(chaptersBundle([["x", "<kbd>K</kbd>"]])),
				)
			).join(""),
		).not.toContain("<");
	});
});
