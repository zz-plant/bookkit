import { describe, expect, it } from "bun:test";
import { PDFDocument, StandardFonts } from "pdf-lib";

import { buildExportChapters } from "./content-parsing";
import {
	extractPdfText,
	inspectPdf,
	xmlWellFormednessProblems,
} from "./inspect";
import { markdownToHtml } from "./markdown-to-html";
import {
	exportIdentifier,
	formatExportEdition,
	toEpubTimestamp,
} from "./metadata";
import { createPdfExport, toWinAnsiText } from "./pdf-generator";
import type { ExportBundle } from "./types";

const oneChapter = (body: string, title = "A"): ExportBundle => ({
	title: "Probe",
	updatedAt: "2026-01-01",
	parts: [
		{
			title: "Chapters",
			entries: [{ kind: "chapter", slug: "a", title, body }],
		},
	],
});

/** XHTML fragments must parse inside an element, as they do in a chapter. */
const wellFormed = (html: string) =>
	xmlWellFormednessProblems(`<div>${html}</div>`);

describe("exports modules", () => {
	it("buildExportChapters parses frontmatter and body", () => {
		const chapters = buildExportChapters({
			"src/content/book/chapters/01-intro.mdx":
				"---\ntitle: Intro\nsummary: Start here\nlocale: en\n---\n# Hello",
		});

		expect(chapters[0]).toEqual({
			kind: "chapter",
			slug: "01-intro",
			title: "Intro",
			description: "Start here",
			locale: "en",
			body: "# Hello",
		});
	});

	it("markdownToHtml renders headings, both list kinds, and quotes", () => {
		const html = markdownToHtml(
			"# Title\n- one\n\n1. first\n2. second\n\n> Verify before closing.",
		);
		expect(html).toContain('<h1 id="title">Title</h1>');
		expect(html).toContain("<ul><li>one</li></ul>");
		expect(html).toContain("<ol><li>first</li><li>second</li></ol>");
		expect(html).toContain(
			"<blockquote><p>Verify before closing.</p></blockquote>",
		);
	});

	it("markdownToHtml keeps code spans and emphasis from mis-nesting", () => {
		const html = markdownToHtml("Use `snake_case` and _emphasis_ here");
		expect(html).toBe(
			"<p>Use <code>snake_case</code> and <em>emphasis</em> here</p>",
		);
		for (const source of [
			"Use `snake_case` and _emphasis_ here",
			"set `max_retries` then check error_rate and _p99_",
			"**a _b** c_ and *x `y* z`",
			"[`a_b` docs](https://example.com/a_b_c) & <Callout>MDX</Callout>",
		]) {
			expect(wellFormed(markdownToHtml(source))).toEqual([]);
		}
	});

	it("markdownToHtml sends every link through the resolver", () => {
		const html = markdownToHtml(
			"See [next](/read/chapters/next#steps) and [home](/downloads).",
			(href) => (href.startsWith("/read/") ? "chapter-next.xhtml#steps" : null),
		);
		expect(html).toContain('<a href="chapter-next.xhtml#steps">next</a>');
		expect(html).toContain("and home.");
	});

	it("xmlWellFormednessProblems reports mis-nested tags and bare ampersands", () => {
		expect(wellFormed("<em>a<strong>b</em></strong>")).toHaveLength(1);
		expect(wellFormed("Tom & Jerry")).toHaveLength(1);
		expect(wellFormed("Tom &amp; Jerry <br/>")).toEqual([]);
	});

	it("exportIdentifier is the RFC 4122 name-based UUID of the URL", () => {
		expect(exportIdentifier("https://on-call.book/")).toBe(
			"urn:uuid:277f8fa5-ba1e-5b01-ad0b-2d57d5b446a9",
		);
	});

	it("dates are written in UTC, without fractional seconds", () => {
		expect(toEpubTimestamp(new Date("2026-10-14T17:41:10.775Z"))).toBe(
			"2026-10-14T17:41:10Z",
		);
		// Midnight UTC is still the 10th west of Greenwich.
		expect(
			formatExportEdition({ version: "0.1.0", updatedAt: "2026-02-10" }),
		).toBe("Version 0.1.0 · February 10, 2026");
		expect(formatExportEdition({ draft: true })).toBe("Draft");
	});

	it("toWinAnsiText keeps WinAnsi text and transliterates the rest", () => {
		expect(toWinAnsiText("café — “quotes” • 50% … ok")).toBe(
			"café — “quotes” • 50% … ok",
		);
		expect(toWinAnsiText("alert → owner ≠ pager ≤ 10 min ✓")).toBe(
			"alert -> owner != pager <= 10 min [x]",
		);
		expect(toWinAnsiText("ship it 🚀 now")).toBe("ship it  now");
		expect(toWinAnsiText("ǎ, Łódź and 漢")).toBe("a, Lódz and ?");
	});

	it("createPdfExport survives characters the standard fonts cannot encode", async () => {
		const bytes = await createPdfExport({
			title: "Runbook → Export ✓",
			version: "1.0 ≥ draft",
			updatedAt: "2026-09-14",
			parts: [
				{
					title: "Chapters",
					entries: [
						{
							kind: "chapter",
							slug: "triage",
							title: "Triage ≠ guessing",
							body: "## Classify → escalate\n\n- Severity ≤ 2 pages the owner 🚀\n\n> Verify ✓ before closing.",
							description: "Arrows everywhere",
							locale: "en",
						},
					],
				},
			],
		});

		expect(Buffer.from(bytes.subarray(0, 4)).toString("utf8")).toBe("%PDF");
		expect(await inspectPdf(bytes)).toEqual([]);
	});

	it("createPdfExport refuses text its fonts cannot draw, naming where it is", async () => {
		const export_ = createPdfExport(
			oneChapter(
				"Каждый сигнал нуждается в одном владельце. 每个警报",
				"Глава",
			),
		);
		await expect(export_).rejects.toThrow('chapter "Глава" (a)');
		await expect(export_).rejects.toThrow("Г (U+0413)");
		await expect(export_).rejects.toThrow("The EPUB export is not affected.");
	});

	it("createPdfExport keeps a 3000-word paragraph on the pages", async () => {
		const words = Array.from({ length: 3000 }, (_, index) => `w${index}`);
		const bytes = await createPdfExport(oneChapter(words.join(" ")));

		expect(await inspectPdf(bytes)).toEqual([]);
		const drawn = new Set(
			(await extractPdfText(bytes))
				.flat()
				.flatMap((run) => run.text.split(" ")),
		);
		expect(words.filter((word) => !drawn.has(word))).toEqual([]);
	});

	it("createPdfExport breaks a word longer than the line", async () => {
		const url = `https://example.com/${"x".repeat(400)}`;
		const bytes = await createPdfExport(oneChapter(`See ${url} now`));
		const font = await (await PDFDocument.create()).embedFont(
			StandardFonts.Helvetica,
		);
		const bodyRuns = (await extractPdfText(bytes))
			.flat()
			.filter((run) => run.text.includes("xxxx"));

		expect(bodyRuns.length).toBeGreaterThan(1);
		for (const run of bodyRuns) {
			expect(run.x + font.widthOfTextAtSize(run.text, 11)).toBeLessThanOrEqual(
				595 - 52,
			);
		}
		expect(bodyRuns.map((run) => run.text).join("")).toContain("x".repeat(400));
	});
});
