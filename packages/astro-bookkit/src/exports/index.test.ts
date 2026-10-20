import { afterAll, describe, expect, it } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import JSZip from "jszip";
import {
	decodePDFRawStream,
	PDFArray,
	PDFDict,
	PDFDocument,
	PDFName,
	PDFRawStream,
	StandardFonts,
} from "pdf-lib";

import { buildExportChapters } from "./content-parsing";
import { createEpubExport } from "./epub-generator";
import { createFileImageLoader } from "./images";
import {
	extractPdfText,
	inspectEpub,
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

/** Each page's lines: the runs drawn on one baseline, in order. */
const pdfLines = async (bytes: Uint8Array) =>
	(await extractPdfText(bytes)).map((runs) => {
		const lines: Array<{ y: number; text: string }> = [];
		for (const run of runs) {
			const last = lines[lines.length - 1];
			if (last && last.y === run.y) last.text += run.text;
			else lines.push({ y: run.y, text: run.text });
		}
		return lines.map((line) => line.text);
	});

/** The PostScript names of the fonts a PDF embeds or names. */
const fontNames = async (bytes: Uint8Array) => {
	const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
	return pdf.context
		.enumerateIndirectObjects()
		.map(([, object]) => object)
		.filter(
			(object): object is PDFDict =>
				object instanceof PDFDict &&
				object.get(PDFName.of("Type"))?.toString() === "/Font" &&
				object.get(PDFName.of("Subtype"))?.toString() !== "/CIDFontType2",
		)
		.map((font) => font.get(PDFName.of("BaseFont"))?.toString().slice(1) ?? "")
		.sort();
};

/** Images drawn on the PDF's pages, with the size each is drawn at. */
const drawnImages = async (bytes: Uint8Array) => {
	const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
	return pdf.getPages().flatMap((page) => {
		const contents = page.node.Contents();
		const streams =
			contents instanceof PDFArray
				? contents.asArray().map((ref) => pdf.context.lookup(ref))
				: [contents];
		return streams
			.filter(
				(stream): stream is PDFRawStream => stream instanceof PDFRawStream,
			)
			.flatMap((stream) => [
				...new TextDecoder("latin1")
					.decode(decodePDFRawStream(stream).decode())
					.matchAll(
						/([\d.]+) 0 0 ([\d.]+) 0 0 cm\s+1 0 0 1 0 0 cm\s+\/\S+ Do/g,
					),
			])
			.map((match) => ({ width: Number(match[1]), height: Number(match[2]) }));
	});
};

const require = createRequire(import.meta.url);
const notoFont = (file: string) =>
	readFileSync(require.resolve(`@fontsource/noto-sans/files/${file}`));

const scratch = mkdtempSync(join(tmpdir(), "bookkit-export-images-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** A public/ folder holding `files`, and a loader that reads it. */
const publicFolder = (files: Record<string, Uint8Array | string>) => {
	const dir = mkdtempSync(join(scratch, "public-"));
	for (const [name, content] of Object.entries(files)) {
		mkdirSync(join(dir, name, ".."), { recursive: true });
		writeFileSync(join(dir, name), content);
	}
	return createFileImageLoader({ publicDir: dir });
};

const png = (width: number, height: number) =>
	new Resvg(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#36c"/></svg>`,
	)
		.render()
		.asPng();

// An 8 by 4 pixel grey JPEG.
const JPEG = Buffer.from(
	"/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/wAALCAAEAAgBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AP//Z",
	"base64",
);

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
			source: "src/content/book/chapters/01-intro.mdx",
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

	it("createPdfExport draws Cyrillic, Greek, and Latin Extended text with real glyphs", async () => {
		const russian = "Каждый сигнал нуждается в одном владельце.";
		const greek = "Κάθε ειδοποίηση χρειάζεται έναν υπεύθυνο.";
		const polish = "Łódź: każdy alarm ma właściciela, ő és ș is.";
		const bytes = await createPdfExport(
			oneChapter(`${russian}\n\n> ${greek}\n\n## ${polish}`, "Глава"),
		);

		expect(await inspectPdf(bytes)).toEqual([]);
		const lines = (await pdfLines(bytes)).flat();
		for (const text of ["Глава", russian, greek, polish]) {
			expect(lines).toContain(text);
		}
		// Western European text keeps Helvetica; the rest is in Noto Sans subsets.
		const fonts = await fontNames(bytes);
		expect(fonts.filter((name) => name.startsWith("Helvetica"))).toEqual([
			"Helvetica",
			"Helvetica-Bold",
			"Helvetica-Oblique",
		]);
		expect(fonts.some((name) => name.startsWith("NotoSans-Regular"))).toBe(
			true,
		);
		expect(fonts.some((name) => name.startsWith("NotoSans-Bold"))).toBe(true);
		expect(fonts.some((name) => name.startsWith("NotoSans-Italic"))).toBe(true);
	});

	it("createPdfExport embeds no other font for Western European text", async () => {
		const bytes = await createPdfExport(
			oneChapter("Café, naïve, Straße — “quoted” → done ✓"),
		);
		expect(await fontNames(bytes)).toEqual([
			"Helvetica",
			"Helvetica-Bold",
			"Helvetica-Oblique",
		]);
		expect((await pdfLines(bytes)).flat()).toContain(
			"Café, naïve, Straße — “quoted” -> done [x]",
		);
	});

	it("createPdfExport refuses text no font has, naming where it is and both settings", async () => {
		const export_ = createPdfExport(
			oneChapter(
				"Каждый сигнал нуждается в одном владельце. 每个警报",
				"Глава",
			),
		);
		await expect(export_).rejects.toThrow(
			'chapter "Глава" (a): 每 (U+6BCF), 个 (U+4E2A), 警 (U+8B66), 报 (U+62A5)',
		);
		await expect(export_).rejects.toThrow(
			"set exports.pdfFont in book.config.ts to a TrueType or OpenType font file that has them",
		);
		await expect(export_).rejects.toThrow("or set exports.pdf to false");
		await expect(export_).rejects.toThrow("The EPUB export is not affected.");
	});

	it("createPdfExport draws what the built-in fonts lack from the book's own font", async () => {
		// Noto Sans's Devanagari file stands in for a book's font: it has ◌ (U+25CC).
		const bookFont = {
			name: "exports.pdfFont (fonts/devanagari.woff)",
			bytes: notoFont("noto-sans-devanagari-400-normal.woff"),
		};
		const bytes = await createPdfExport(oneChapter("Placeholder: ◌"), {
			pdfFonts: () => [bookFont],
		});
		expect((await pdfLines(bytes)).flat()).toContain("Placeholder: ◌");

		await expect(
			createPdfExport(oneChapter("每个警报"), { pdfFonts: () => [bookFont] }),
		).rejects.toThrow(
			"and the font in exports.pdfFont does not have these either",
		);
		// The font has Devanagari letters, but pdf-lib cannot shape that script.
		await expect(
			createPdfExport(oneChapter("नमस्ते"), { pdfFonts: () => [bookFont] }),
		).rejects.toThrow(
			"but the PDF cannot lay out their script: it needs syllable shaping that the PDF's font engine does not do. Set exports.pdf to false",
		);
	});

	it("createPdfExport embeds PNG and JPEG images, never wider than the text", async () => {
		const warnings: string[] = [];
		const options = {
			loadImage: publicFolder({
				"images/wide.png": png(2000, 100),
				"images/small.jpg": JPEG,
			}),
			onWarning: (message: string) => warnings.push(message),
		};
		const bytes = await createPdfExport(
			oneChapter(
				'Before.\n\n![A wide board](/images/wide.png)\n\nBetween <img src="/images/small.jpg" alt="swatch" /> after.',
			),
			options,
		);

		expect(warnings).toEqual([]);
		expect(await inspectPdf(bytes)).toEqual([]);
		expect(await drawnImages(bytes)).toEqual([
			{ width: 491, height: 24.55 },
			{ width: 6, height: 3 },
		]);
		expect((await pdfLines(bytes)).flat()).toEqual([
			"Probe",
			"January 1, 2026",
			"A",
			"Before.",
			"Between",
			"after.",
		]);
	});

	it("shows the alt text for an image an export cannot carry, and says why", async () => {
		const warnings: string[] = [];
		const options = {
			loadImage: publicFolder({
				"images/diagram.svg":
					'<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>',
			}),
			onWarning: (message: string) => warnings.push(message),
		};
		const bundle = oneChapter(
			"See ![the flow](/images/diagram.svg), ![the dashboard](https://example.com/d.png), and ![the board](/images/missing.png).",
		);
		const pdf = await createPdfExport(bundle, options);

		expect((await pdfLines(pdf)).flat()).toContain(
			"See [Image: the flow], [Image: the dashboard], and [Image: the board].",
		);
		expect(await drawnImages(pdf)).toEqual([]);
		expect(warnings).toEqual([
			'PDF export: chapter "A" (a): image /images/diagram.svg is an SVG, and the PDF embeds PNG and JPEG images only, so the PDF shows its alt text instead. Link a PNG or JPEG copy to show the image in the PDF.',
			'PDF export: chapter "A" (a): image https://example.com/d.png is not a file in the book, and images are not downloaded at build time, so the PDF shows its alt text instead. Put the image in the book\'s public/images/ folder and link it as /images/<file name>.',
			expect.stringMatching(
				/^PDF export: chapter "A" \(a\): image \/images\/missing\.png was not found at .*images\/missing\.png, so the PDF shows its alt text instead\. A path that starts with \/ is read from the book's public\/ folder; check the file name\.$/,
			),
		]);

		// The EPUB carries the SVG; the others show their alt text there too.
		warnings.length = 0;
		const epub = await createEpubExport(bundle, options);
		expect(await inspectEpub(epub)).toEqual([]);
		const chapter = await (await JSZip.loadAsync(epub))
			.file("OEBPS/text/chapter-a.xhtml")
			?.async("string");
		expect(chapter).toContain(
			'See <img src="../images/diagram.svg" alt="the flow"/>, <span class="image-alt">[Image: the dashboard]</span>, and <span class="image-alt">[Image: the board]</span>.',
		);
		expect(warnings.map((warning) => warning.slice(0, 50))).toEqual([
			'EPUB export: chapter "A" (a): image https://exampl',
			'EPUB export: chapter "A" (a): image /images/missin',
		]);
	});

	it("createEpubExport stores each image once and lists it in the manifest", async () => {
		const loadImage = publicFolder({
			"images/board.png": png(8, 4),
			"other/board.png": png(4, 4),
		});
		const epub = await createEpubExport(
			{
				...oneChapter(
					"![Board](/images/board.png)\n\n![Board again](/images/board.png)",
				),
				parts: [
					{
						title: "Chapters",
						entries: [
							{
								kind: "chapter",
								slug: "a",
								title: "A",
								body: "![Board](/images/board.png)\n\n![Board again](/images/board.png)",
							},
							{
								kind: "chapter",
								slug: "b",
								title: "B",
								body: "[![Another board](/other/board.png)](https://example.com)",
							},
						],
					},
				],
			},
			{ loadImage, onWarning: () => {} },
		);

		expect(await inspectEpub(epub)).toEqual([]);
		const zip = await JSZip.loadAsync(epub);
		expect(
			Object.keys(zip.files).filter((path) => path.includes("images/")),
		).toEqual(["OEBPS/images/board.png", "OEBPS/images/board-2.png"]);
		const opf = (await zip.file("OEBPS/content.opf")?.async("string")) ?? "";
		expect(opf).toContain(
			'<item id="image-1" href="images/board.png" media-type="image/png"/>',
		);
		expect(opf).toContain(
			'<item id="image-2" href="images/board-2.png" media-type="image/png"/>',
		);
		expect(
			await zip.file("OEBPS/text/chapter-b.xhtml")?.async("string"),
		).toContain(
			'<a href="https://example.com"><img src="../images/board-2.png" alt="Another board"/></a>',
		);
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
