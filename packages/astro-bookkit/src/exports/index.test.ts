import { describe, expect, it } from "bun:test";

import { buildExportChapters } from "./content-parsing";
import { markdownToHtml } from "./markdown-to-html";
import { createPdfExport, toWinAnsiText } from "./pdf-generator";

describe("exports modules", () => {
	it("buildExportChapters parses frontmatter and body", () => {
		const chapters = buildExportChapters({
			"src/content/book/chapters/01-intro.mdx":
				"---\ntitle: Intro\nsummary: Start here\nlocale: en\n---\n# Hello",
		});

		expect(chapters[0]).toEqual({
			slug: "01-intro",
			title: "Intro",
			description: "Start here",
			locale: "en",
			body: "# Hello",
		});
	});

	it("markdownToHtml renders headings/lists and rewrites chapter links", () => {
		const html = markdownToHtml(
			"# Title\n- one\n\nSee [Next](/read/chapters/next)",
			["next"],
		);
		expect(html).toContain('<h1 id="title">Title</h1>');
		expect(html).toContain("<ul><li>one</li></ul>");
		expect(html).toContain('href="chapters/next.xhtml"');
	});

	it("toWinAnsiText keeps WinAnsi text and transliterates the rest", () => {
		expect(toWinAnsiText("café — “quotes” • 50% … ok")).toBe(
			"café — “quotes” • 50% … ok",
		);
		expect(toWinAnsiText("alert → owner ≠ pager ≤ 10 min ✓")).toBe(
			"alert -> owner != pager <= 10 min [x]",
		);
		expect(toWinAnsiText("ship it 🚀 now")).toBe("ship it  now");
		expect(toWinAnsiText("ǎ and 漢")).toBe("a and ?");
	});

	it("createPdfExport survives characters the standard fonts cannot encode", async () => {
		const bytes = await createPdfExport({
			title: "Runbook → Export ✓",
			version: "1.0 ≥ draft",
			updatedAt: "2026-09-14",
			chapters: [
				{
					slug: "triage",
					title: "Triage ≠ guessing",
					body: "## Classify → escalate\n\n- Severity ≤ 2 pages the owner 🚀\n\n> Verify ✓ before closing.",
					description: "Arrows everywhere",
					locale: "en",
				},
			],
		});

		expect(Buffer.from(bytes.subarray(0, 4)).toString("utf8")).toBe("%PDF");
		expect(bytes.length).toBeGreaterThan(1000);
	});
});
