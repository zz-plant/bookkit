import { describe, expect, it } from "bun:test";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFString } from "pdf-lib";
import { chaptersBundle } from "./fixtures/pdf-text";
import {
	extractPdfLinks,
	extractPdfText,
	inspectPdf,
	pdfDestinationNames,
} from "./inspect";
import { createPdfExport } from "./pdf-generator";

/**
 * The PDF draws bold and italic text in bold and italic faces (Noto Sans in
 * the matching weight for text Helvetica cannot draw), and makes links
 * clickable: a web address opens, and a link to a chapter, mechanism, or
 * heading in the same PDF goes to it.
 */

const fontsOf = async (bytes: Uint8Array, words: string[]) => {
	const runs = (await extractPdfText(bytes)).flat();
	return Object.fromEntries(
		words.map((word) => [
			word,
			runs.find((run) => run.text.trim() === word)?.font.replace(/-\d+$/, ""),
		]),
	);
};

describe("bold and italic text in the PDF", () => {
	it("is drawn in Helvetica's bold, oblique, and bold oblique faces, and code in Courier's", async () => {
		const pdf = await createPdfExport(
			chaptersBundle([
				[
					"a",
					"**Bold** and _italic_ and ***both*** and __under__ and *star*\n\n**Bold `b1`** and _italic `i1`_ and ***both `bi1`*** and `plain`\n\n> Quoted **strong**",
				],
			]),
		);
		expect(await inspectPdf(pdf)).toEqual([]);
		expect(
			await fontsOf(pdf, [
				"Bold",
				"italic",
				"both",
				"under",
				"star",
				"b1",
				"i1",
				"bi1",
				"plain",
				"Quoted",
				"strong",
			]),
		).toEqual({
			Bold: "Helvetica-Bold",
			italic: "Helvetica-Oblique",
			both: "Helvetica-BoldOblique",
			under: "Helvetica-Bold",
			star: "Helvetica-Oblique",
			b1: "Courier-Bold",
			i1: "Courier-Oblique",
			bi1: "Courier-BoldOblique",
			plain: "Courier",
			// A quote is italic, so bold in it is bold italic.
			Quoted: "Helvetica-Oblique",
			strong: "Helvetica-BoldOblique",
		});
	});

	it("draws Cyrillic and Greek in Noto Sans of the same weight and slant, embedded as subsets", async () => {
		const pdf = await createPdfExport(
			chaptersBundle([
				["a", "**Жирный** _курсив_ ***оба*** обычный **Έντονα**"],
			]),
		);
		expect(await inspectPdf(pdf)).toEqual([]);
		expect(
			await fontsOf(pdf, ["Жирный", "курсив", "оба", "обычный", "Έντονα"]),
		).toEqual({
			Жирный: "NotoSans-Bold",
			курсив: "NotoSans-Italic",
			оба: "NotoSans-BoldItalic",
			обычный: "NotoSans-Regular",
			Έντονα: "NotoSans-Bold",
		});
	});

	it("embeds no bold oblique face for text without bold italic", async () => {
		const pdf = await createPdfExport(
			chaptersBundle([["a", "**Bold** _italic_"]]),
		);
		const runs = (await extractPdfText(pdf)).flat();
		expect(new Set(runs.map((run) => run.font))).toEqual(
			new Set(["Helvetica", "Helvetica-Bold", "Helvetica-Oblique"]),
		);
	});
});

describe("links in the PDF", () => {
	const linking = [
		"See [the owner section](/read/chapters/b#owner--escalation),",
		"[all of b](/read/chapters/b),",
		"[a missing heading](/read/chapters/b#nope),",
		"[a mechanism](/read/mechanisms/m),",
		"[a page not in the PDF](/read/chapters/z),",
		"[a site page](/releases),",
		"[the web](https://example.com/wiki/Foo_(bar)),",
		"[**bold link**](https://example.com/b),",
		"[mail](mailto:oncall@example.com),",
		"[a script](javascript:alert(1)),",
		"[a relative file](notes.md),",
		"and [back up](#a-heading).",
		"\n\n## A heading",
	].join(" ");
	const bundle = (siteUrl?: string) => ({
		...chaptersBundle([
			["a", linking],
			["b", "## Owner -- escalation\n\nText."],
		]),
		...(siteUrl ? { siteUrl } : {}),
	});

	it("go to the heading or entry in the PDF, else to the site, else nowhere", async () => {
		const pdf = await createPdfExport(bundle("https://book.test/"));
		expect(await inspectPdf(pdf)).toEqual([]);
		expect(
			(await extractPdfLinks(pdf)).map((link) => link.destination ?? link.uri),
		).toEqual([
			"chapters/b/owner--escalation",
			"chapters/b",
			// No such heading: the link goes to the top of the chapter.
			"chapters/b",
			// No such mechanism in this PDF: the site's page.
			"https://book.test/read/mechanisms/m",
			"https://book.test/read/chapters/z",
			"https://book.test/releases",
			"https://example.com/wiki/Foo_(bar)",
			"https://example.com/b",
			"mailto:oncall@example.com",
			"chapters/a/a-heading",
		]);
		expect(
			[...pdfDestinationNames(await PDFDocument.load(pdf))].sort(),
		).toEqual([
			"chapters/a",
			"chapters/a/a-heading",
			"chapters/b",
			"chapters/b/owner--escalation",
		]);
	});

	it("make only links inside the PDF clickable when the book has no site URL", async () => {
		const pdf = await createPdfExport(bundle());
		expect(
			(await extractPdfLinks(pdf)).map((link) => link.destination ?? link.uri),
		).toEqual([
			"chapters/b/owner--escalation",
			"chapters/b",
			"chapters/b",
			"https://example.com/wiki/Foo_(bar)",
			"https://example.com/b",
			"mailto:oncall@example.com",
			"chapters/a/a-heading",
		]);
	});

	it("cover the linked words, across faces, and send a destination to its heading's page", async () => {
		const pdf = await createPdfExport(bundle("https://book.test"));
		const pages = await extractPdfText(pdf);
		const links = await extractPdfLinks(pdf);
		const runs = pages.flatMap((runs, index) =>
			runs.map((run) => ({ ...run, page: index + 1 })),
		);
		for (const words of ["all of b", "bold link"]) {
			const run = runs.find((candidate) => candidate.text === words);
			const link = links.find(
				(candidate) =>
					candidate.page === run?.page &&
					Math.abs(candidate.rect[0] - (run?.x ?? 0)) < 0.01,
			);
			expect(link).toBeDefined();
			expect(link?.rect[1]).toBeLessThan(run?.y ?? 0);
			expect(link?.rect[3]).toBeGreaterThan(run?.y ?? 0);
		}
		// The named destination points at the page the heading is drawn on.
		const loaded = await PDFDocument.load(pdf);
		const dests = loaded.catalog
			.lookup(PDFName.of("Names"), PDFDict)
			.lookup(PDFName.of("Dests"), PDFDict)
			.lookup(PDFName.of("Names"), PDFArray);
		const names = Array.from({ length: dests.size() / 2 }, (_, index) => ({
			name: (dests.lookup(index * 2) as PDFString).decodeText(),
			page: loaded
				.getPages()
				.findIndex(
					(page) =>
						page.ref ===
						(dests.lookup(index * 2 + 1, PDFArray).get(0) as never),
				),
		}));
		const heading = runs.find((run) => run.text === "Owner -- escalation");
		expect(
			names.find((entry) => entry.name === "chapters/b/owner--escalation")
				?.page,
		).toBe((heading?.page ?? 0) - 1);
	});

	it("are checked: a link to a destination the PDF lacks is a problem", async () => {
		const pdf = await PDFDocument.create();
		const page = pdf.addPage();
		page.drawText("text");
		page.node.addAnnot(
			pdf.context.register(
				pdf.context.obj({
					Type: "Annot",
					Subtype: "Link",
					Rect: [0, 0, 10, 10],
					A: { S: "GoTo", D: PDFString.of("chapters/gone") },
				}),
			),
		);
		expect(await inspectPdf(await pdf.save())).toEqual([
			'page 1 links to "chapters/gone", which the PDF does not have',
		]);
	});
});
