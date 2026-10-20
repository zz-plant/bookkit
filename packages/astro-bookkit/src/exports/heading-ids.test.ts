import { describe, expect, it } from "bun:test";
import { PDFDocument } from "pdf-lib";
import { createEpubExport } from "./epub-generator";
import { chaptersBundle, epubChapter } from "./fixtures/pdf-text";
import {
	extractPdfLinks,
	inspectEpub,
	inspectPdf,
	pdfDestinationNames,
} from "./inspect";
import { markdownToHtml } from "./markdown-to-html";
import { createPdfExport } from "./pdf-generator";

/**
 * Headings get the ids the site gives them, so a link to
 * `/read/chapters/x#heading` lands on the heading in the EPUB and the PDF.
 * Each id below is the one Astro 7.3.8 gave the same heading on a built
 * chapter page: github-slugger over the heading's text after smart
 * punctuation turned `--` and `---` into dashes (but not in code), one
 * slugger per page, and no id for a heading written as an HTML tag.
 */
const SITE_IDS: Array<[string, string | null]> = [
	['Don\'t -- stop: the "quick" fix...', "dont--stop-the-quick-fix"],
	["Café & crème — 100% (beta)", "café--crème--100-beta"],
	["Tuning `max_retries`", "tuning-max_retries"],
	["Tuning `max_retries`", "tuning-max_retries-1"],
	["Step 1. Check <kbd>Ctrl</kbd>", "step-1-check-ctrl"],
	["C++ / C# & .NET", "c--c--net"],
	["Привет, мир!", "привет-мир"],
	["Emoji 🚀 launch", "emoji--launch"],
	["API_KEY__value -- x --- y", "api_key__value--x--y"],
	["Code `a--b` keeps -- its dashes", "code-a--b-keeps--its-dashes"],
	[
		"[Linked heading](https://example.com) and *emphasis*",
		"linked-heading-and-emphasis",
	],
	["trailing punctuation?!", "trailing-punctuation"],
	["<h2>HTML heading</h2>", null],
	["HTML heading", "html-heading"],
	["1. Numbered", "1-numbered"],
];

const body = SITE_IDS.map(([text]) =>
	text.startsWith("<") ? text : `## ${text}`,
).join("\n\n");

describe("heading ids", () => {
	it("are the site's in the EPUB, made valid XML ids", () => {
		const ids = [
			...markdownToHtml(body).matchAll(/<h2(?: id="([^"]*)")?>/g),
		].map((match) => match[1] ?? null);
		// An XML id cannot start with a digit, so the EPUB puts "_" before one.
		expect(ids).toEqual(
			SITE_IDS.map(([, id]) => (id && /^\d/.test(id) ? `_${id}` : id)),
		);
	});

	it("are the PDF's named destinations, under the entry's site path", async () => {
		const pdf = await createPdfExport(chaptersBundle([["a", body]]));
		const names = pdfDestinationNames(
			await PDFDocument.load(pdf, { updateMetadata: false }),
		);
		expect([...names].sort()).toEqual(
			[
				"chapters/a",
				...SITE_IDS.flatMap(([, id]) => (id ? [`chapters/a/${id}`] : [])),
			].sort(),
		);
	});

	it("let links from another chapter land on the heading in both formats", async () => {
		const bundle = chaptersBundle([
			["a", body],
			[
				"b",
				"See [the fix](/read/chapters/a#dont--stop-the-quick-fix), [Café](/read/chapters/a#café--crème--100-beta), and [numbered](/read/chapters/a#1-numbered).",
			],
		]);
		const epub = await createEpubExport(bundle);
		expect(await inspectEpub(epub)).toEqual([]);
		expect(await epubChapter(epub, "b")).toContain(
			'<a href="chapter-a.xhtml#dont--stop-the-quick-fix">the fix</a>, <a href="chapter-a.xhtml#café--crème--100-beta">Café</a>, and <a href="chapter-a.xhtml#_1-numbered">numbered</a>',
		);

		const pdf = await createPdfExport(bundle);
		expect(await inspectPdf(pdf)).toEqual([]);
		expect(
			(await extractPdfLinks(pdf)).flatMap((link) => link.destination ?? []),
		).toEqual([
			"chapters/a/dont--stop-the-quick-fix",
			"chapters/a/café--crème--100-beta",
			"chapters/a/1-numbered",
		]);
	});
});
