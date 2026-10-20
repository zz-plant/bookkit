import { afterAll, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { parseFrontmatter } from "./content-parsing";
import { createEpubExport } from "./epub-generator";
import {
	EPUBCHECK_CLEAN,
	epubcheck,
	missingInOrder,
	pdfPages,
} from "./fixtures/pdf-text";
import { extractPdfText, inspectEpub, inspectPdf } from "./inspect";
import { markdownToHtml } from "./markdown-to-html";
import { createPdfExport } from "./pdf-generator";
import type { ExportBundle } from "./types";

/**
 * fixtures/markdown-coverage.mdx holds every Markdown construct the PDF and
 * EPUB used to drop or print raw (inline code, escaped placeholders,
 * tables, reference-style links, footnotes, character references, fenced
 * code), nested the way authors nest them. Both formats must show its words
 * in order, with no Markdown syntax left over.
 */

const fixture = parseFrontmatter(
	readFileSync(
		join(import.meta.dir, "fixtures", "markdown-coverage.mdx"),
		"utf8",
	),
);

const chapter = (body: string, title = "Coverage"): ExportBundle => ({
	title: "Probe",
	updatedAt: "2026-01-01",
	parts: [
		{
			title: "Chapters",
			entries: [{ kind: "chapter", slug: "coverage", title, body }],
		},
	],
});
const coverage = chapter(fixture.body, fixture.data.title);

/** Markdown syntax that must never reach a reader. */
const RAW_MARKDOWN = [
	"`",
	"[^",
	"](",
	"][",
	"[checklist]",
	"| ---",
	"\\<",
	"&#",
	"&lt;",
	"&mdash;",
	"{/*",
];

const chapterXhtml = async (epub: Uint8Array) =>
	(await (
		await JSZip.loadAsync(epub)
	)
		.file("OEBPS/text/chapter-coverage.xhtml")
		?.async("string")) ?? "";

const scratch = mkdtempSync(join(tmpdir(), "bookkit-markdown-coverage-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("Markdown coverage of the exports", () => {
	it("the PDF shows every construct's words in order, code in Courier", async () => {
		const pdf = await createPdfExport(coverage);
		expect(await inspectPdf(pdf)).toEqual([]);
		const text = (await pdfPages(pdf)).join("\n");

		expect(
			missingInOrder(text, [
				"Markdown in the exports",
				"Set max_retries and backoff_ms before the first page.",
				"Page <on-call-lead> or <service-owner> within <10 minutes.",
				"export the timeline, then import it into the review — Café rules apply.",
				"Tuning max_retries",
				"Signal",
				"Action",
				"Within",
				"pager",
				"Classify first",
				"5 min",
				"Slack ping",
				"Batch it with /batch and reply once the queue is empty",
				"30 min",
				"Read the handoff checklist, the runbook, and Severity.",
				"Every handoff needs an owner.1 Escalate after an hour.2",
				"Set max_retries to 3 before paging.",
				"Check error_rate first, then roll back.",
				"oncall handoff --to @next \\",
				'  --note "{state}" <<EOF',
				"Notes",
				"1.See the ownership guide and OWNERS.md.",
				"2.Sixty minutes, by the pager's clock.",
			]),
		).toEqual([]);
		expect(RAW_MARKDOWN.filter((raw) => text.includes(raw))).toEqual([]);

		// Code is drawn in Courier, bold in a heading or bold text and oblique in
		// italic text; prose stays in Helvetica.
		const loaded = await PDFDocument.load(pdf, { updateMetadata: false });
		const fonts = loaded.context
			.enumerateIndirectObjects()
			.map(([, object]) => object.toString())
			.flatMap((object) => object.match(/\/BaseFont \/([\w-]+)/)?.[1] ?? [])
			.sort();
		expect(fonts).toEqual([
			"Courier",
			"Courier-Bold",
			"Courier-Oblique",
			"Helvetica",
			"Helvetica-Bold",
			"Helvetica-Oblique",
		]);
	});

	it("the EPUB marks up every construct and passes its structural check", async () => {
		const epub = await createEpubExport(coverage);
		expect(await inspectEpub(epub)).toEqual([]);
		const xhtml = await chapterXhtml(epub);

		expect(
			missingInOrder(xhtml, [
				"<p>Set <code>max_retries</code> and <code>backoff_ms</code> before the first page.</p>",
				"<p>Page &lt;on-call-lead&gt; or &lt;service-owner&gt; within &lt;10 minutes.</p>",
				"<p>export the timeline, then import it into the review — Café rules apply.</p>",
				'<h2 id="tuning-max_retries">Tuning <code>max_retries</code></h2>',
				'<table><thead><tr><th class="align-left">Signal</th><th class="align-center">Action</th><th class="align-right">Within</th></tr></thead><tbody><tr><td class="align-left"><code>pager</code></td>',
				'<td class="align-center">Batch it with <code>/batch</code> and reply once the queue is empty</td>',
				'<a href="https://example.com/checklist">handoff checklist</a>',
				'<a href="https://example.com/runbook">runbook</a>',
				'<a href="https://example.com/severity">Severity</a>',
				'owner.<sup><a id="fnref.1" href="#fn.1" epub:type="noteref" role="doc-noteref">1</a></sup>',
				'hour.<sup><a id="fnref.2" href="#fn.2" epub:type="noteref" role="doc-noteref">2</a></sup>',
				"<li><strong>Set <code>max_retries</code> to 3</strong> before paging.</li>",
				"<li><em>Check <code>error_rate</code> first</em>, then roll back.</li>",
				"<pre><code>oncall handoff --to @next \\\n  --note &quot;{state}&quot; &lt;&lt;EOF</code></pre>",
				'<section class="notes" epub:type="endnotes" role="doc-endnotes"><h2>Notes</h2><ol>',
				'<li id="fn.1"><p>See <a href="https://example.com/owners">the ownership guide</a> and <code>OWNERS.md</code>. <a href="#fnref.1" epub:type="backlink" role="doc-backlink">↩</a></p></li>',
				'<li id="fn.2"><p>Sixty minutes, by the pager&#39;s clock. <a href="#fnref.2" epub:type="backlink" role="doc-backlink">↩</a></p></li>',
			]),
		).toEqual([]);
		const article = xhtml.slice(xhtml.indexOf("<article>"));
		expect(
			[
				"[^",
				"](",
				"][",
				"[checklist]",
				"| ---",
				"\\&lt;",
				"&amp;",
				"{/*",
			].filter((raw) => article.includes(raw)),
		).toEqual([]);
	});

	// epubcheck needs Java: EPUBCHECK_JAR=/path/to/epubcheck.jar (official W3C release) and `java` on PATH or in JAVA.
	it.skipIf(!process.env.EPUBCHECK_JAR)(
		"the EPUB's tables, code, and endnotes pass epubcheck",
		async () => {
			const epub = await createEpubExport(coverage);
			const xhtml = await chapterXhtml(epub);
			for (const element of [
				"<table>",
				"<pre><code>",
				'epub:type="endnotes"',
			]) {
				expect(xhtml).toContain(element);
			}
			expect(epubcheck(epub, scratch, "coverage")).toContain(EPUBCHECK_CLEAN);
		},
		60_000,
	);

	it("decodes character references everywhere but in code, and keeps unknown names as written", () => {
		const html = markdownToHtml(
			"Tom &amp; Jerry &#x2014; &bogus; &#0; `&amp;` and [a &amp; b](https://x.test/?a=1&amp;b=2)\n\n## Caf&eacute;",
		);
		expect(html).toBe(
			'<p>Tom &amp; Jerry — &amp;bogus; � <code>&amp;amp;</code> and <a href="https://x.test/?a=1&amp;b=2">a &amp; b</a></p>\n<h2 id="café">Café</h2>',
		);
	});

	it("keeps backslash-escaped Markdown as text", () => {
		expect(
			markdownToHtml("\\*not emphasis\\* \\[not a link\\](x) \\`not code\\`"),
		).toBe("<p>*not emphasis* [not a link](x) `not code`</p>");
	});

	it("resolves reference links by label, ignoring case, and leaves undefined ones as written", () => {
		const html = markdownToHtml(
			"[One][A], [two][], [Two], [three][nope], ![Board][img], - [ ] task\n\n[a]: https://a.test\n[TWO]: <https://two.test> 'Two'\n[img]: /images/board.png",
		);
		expect(html).toBe(
			'<p><a href="https://a.test">One</a>, <a href="https://two.test">two</a>, <a href="https://two.test">Two</a>, [three][nope], <img src="/images/board.png" alt="Board"/>, - [ ] task</p>',
		);
	});

	it("numbers footnotes as they are first referred to, links each reference back, and leaves undefined ones as written", () => {
		const html = markdownToHtml(
			"B[^b] then A[^a], B again[^B], missing[^x].\n\n[^a]: Note A.\n[^b]: Note B,\n    second paragraph.\n\n    Third.\n[^unused]: Never referred to.",
		);
		expect(html).toContain(
			'B<sup><a id="fnref.1" href="#fn.1" epub:type="noteref" role="doc-noteref">1</a></sup> then A<sup><a id="fnref.2" href="#fn.2" epub:type="noteref" role="doc-noteref">2</a></sup>, B again<sup><a id="fnref.1.2" href="#fn.1" epub:type="noteref" role="doc-noteref">1</a></sup>, missing[^x].',
		);
		expect(html).toContain(
			'<li id="fn.1"><p>Note B, second paragraph.</p><p>Third. <a href="#fnref.1" epub:type="backlink" role="doc-backlink">↩</a> <a href="#fnref.1.2" epub:type="backlink" role="doc-backlink">↩<sup>2</sup></a></p></li><li id="fn.2"><p>Note A. <a href="#fnref.2" epub:type="backlink" role="doc-backlink">↩</a></p></li>',
		);
		expect(html).not.toContain("Never referred to");
	});

	it("reads GFM tables: alignment, escaped pipes, short rows, and where the table ends", () => {
		const html = markdownToHtml(
			"| a | b |\n|:-:|--:|\n| `x \\| y` | 2 |\n| only |\nafter row\n\nNot a table | here",
		);
		expect(html).toBe(
			'<table><thead><tr><th class="align-center">a</th><th class="align-right">b</th></tr></thead><tbody><tr><td class="align-center"><code>x | y</code></td><td class="align-right">2</td></tr><tr><td class="align-center">only</td><td class="align-right"></td></tr><tr><td class="align-center">after row</td><td class="align-right"></td></tr></tbody></table>\n<p>Not a table | here</p>',
		);
	});

	it("the PDF fits a table to the text width, repeats its header on each page, and writes out a table too wide to read row by row", async () => {
		const long =
			"Compare the error rate with last week's baseline before paging.";
		const rows = Array.from(
			{ length: 70 },
			(_, index) =>
				`| ${index} | \`signal-${index}\` | ${index === 0 ? long.repeat(3) : "Hold"} |`,
		);
		const wide = Array.from({ length: 12 }, (_, index) => `Col${index}`);
		const pdf = await createPdfExport(
			chapter(
				[
					"| # | Signal | Action |",
					"| --: | --- | --- |",
					...rows,
					"",
					`| ${wide.join(" | ")} |`,
					`|${"---|".repeat(12)}`,
					`| ${wide.map((_, index) => `value_${index}_with_a_long_identifier`).join(" | ")} |`,
				].join("\n"),
			),
		);
		expect(await inspectPdf(pdf)).toEqual([]);

		// No text runs past the right margin.
		const helvetica = await (await PDFDocument.create()).embedFont(
			StandardFonts.Helvetica,
		);
		const runs = (await extractPdfText(pdf)).flat();
		const tooWide = runs.filter(
			(run) =>
				run.x + helvetica.widthOfTextAtSize(run.text, 10) > 595 - 52 + 0.01,
		);
		expect(tooWide.map((run) => run.text)).toEqual([]);

		const pages = await pdfPages(pdf);
		// The grid's header starts the table and every page it continues to.
		const tablePages = pages.filter((page) => page.includes("signal-"));
		expect(tablePages.length).toBeGreaterThan(1);
		for (const page of tablePages) {
			expect(page.slice(0, page.indexOf("signal-"))).toContain("#SignalAction");
		}
		expect(pages.join("\n")).toContain(long.split(" ").slice(0, 4).join(" "));
		// Twelve columns cannot be read side by side: one "Header: value" line each.
		expect(
			missingInOrder(
				pages.join("\n"),
				wide.map(
					(name, index) => `${name}: value_${index}_with_a_long_identifier`,
				),
			),
		).toEqual([]);
	});
});
