import { describe, expect, it } from "bun:test";
import JSZip from "jszip";
import {
	PDFArray,
	PDFDict,
	PDFDocument,
	PDFName,
	type PDFString,
} from "pdf-lib";
import { SITE_HEADING_IDS as SITE_IDS } from "../utils/fixtures/site-heading-ids";
import { buildExportParts } from "./content-parsing";
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

	it("count an underlined heading, as the site does, and read `---` alone as a rule", () => {
		expect(
			markdownToHtml(
				"Setext Setup\n------------\n\nText.\n\n---\n\nTitle\n===\n\n## Setext Setup",
			),
		).toBe(
			'<h2 id="setext-setup">Setext Setup</h2>\n<p>Text.</p>\n<hr/>\n<h1 id="title">Title</h1>\n<h2 id="setext-setup-1">Setext Setup</h2>',
		);
	});
});

describe("a toolkit action's headings", () => {
	// The toolkit page shows the sections written from the action's fields
	// with no ids, so its body's "## Steps" is `steps` there.
	const parts = buildExportParts({
		toolkit: {
			"/toolkit/classify.mdx":
				"---\nname: Classify\nslug: classify\nsteps:\n  - Read the payload.\n---\n\n## Steps\n\nWhy these steps.",
		},
		chapters: {
			"/chapters/a.mdx":
				"---\ntitle: A\n---\n\nSee [the steps](/read/toolkit/classify#steps).",
		},
	});
	const bundle = { title: "Probe", parts };

	it("keep the ids the site gives its body's headings in the EPUB", async () => {
		const epub = await createEpubExport(bundle);
		expect(await inspectEpub(epub)).toEqual([]);
		const zip = await JSZip.loadAsync(epub);
		const action =
			(await zip.file("OEBPS/text/tool-classify.xhtml")?.async("string")) ?? "";
		expect(action).toContain(
			'<h2 id="steps-1">Steps</h2>\n<ol><li>Read the payload.</li></ol>\n<h2 id="steps">Steps</h2>\n<p>Why these steps.</p>',
		);
		expect(await epubChapter(epub, "a")).toContain(
			'<a href="tool-classify.xhtml#steps">the steps</a>',
		);
	});

	it("name the body's heading `steps` in the PDF", async () => {
		const pdf = await createPdfExport(bundle);
		expect(await inspectPdf(pdf)).toEqual([]);
		const loaded = await PDFDocument.load(pdf, { updateMetadata: false });
		expect([...pdfDestinationNames(loaded)].sort()).toEqual([
			"chapters/a",
			"toolkit/classify",
			"toolkit/classify/steps",
			"toolkit/classify/steps-1",
		]);
		// The body's "Steps" comes after the written one, so lower on the page.
		const tops = Object.fromEntries(
			["toolkit/classify/steps", "toolkit/classify/steps-1"].map((name) => {
				const dests = loaded.catalog
					.lookup(PDFName.of("Names"), PDFDict)
					.lookup(PDFName.of("Dests"), PDFDict)
					.lookup(PDFName.of("Names"), PDFArray);
				const index = Array.from({ length: dests.size() / 2 }, (_, at) =>
					(dests.lookup(at * 2) as PDFString).decodeText(),
				).indexOf(name);
				const destination = dests.lookup(index * 2 + 1, PDFArray);
				return [name, Number(destination.get(3).toString())];
			}),
		);
		expect(tops["toolkit/classify/steps"]).toBeLessThan(
			tops["toolkit/classify/steps-1"],
		);
	});
});
