import { describe, expect, it } from "bun:test";
import JSZip from "jszip";
import { PDFDocument, PDFString } from "pdf-lib";
import { createEpubExport } from "./epub-generator";
import { articleBody, chaptersBundle, epubChapter } from "./fixtures/pdf-text";
import { extractPdfLinks, inspectEpub, inspectPdf } from "./inspect";
import { isSafeLink, linkScheme, markdownToHtml } from "./markdown-to-html";
import { createPdfExport } from "./pdf-generator";

/**
 * A link that would run code or open a document the link itself carries
 * (`javascript:`, `vbscript:`, `data:`, `file:`) keeps its words in the EPUB
 * and the PDF, unlinked, however its scheme is written. The structural
 * checks `check:build` runs report one if a file has it anyway.
 */

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
].join(" ");
const SAFE =
	"[web](https://example.com) [mail](mailto:a@example.com) [phone](tel:+15550100) [files](ftp://example.com/f)";
const WORDS = "js upper escaped vb data file html tab space";

describe("link schemes", () => {
	it("are read as a browser reads them", () => {
		expect(linkScheme("JaVaScRiPt:alert(1)")).toBe("javascript");
		expect(linkScheme("java\tscript:alert(1)")).toBe("javascript");
		expect(linkScheme(" \u0001javascript:alert(1)")).toBe("javascript");
		expect(linkScheme("/read/chapters/a#b")).toBeNull();
		expect(linkScheme("notes.md")).toBeNull();
		expect(isSafeLink("https://example.com")).toBe(true);
		expect(isSafeLink("#heading")).toBe(true);
		expect(isSafeLink("vbscript:x")).toBe(false);
		expect(isSafeLink("data:text/html,x")).toBe(false);
	});
});

describe("unsafe links in the EPUB", () => {
	it("keep their words without a link, whatever the resolver returns", () => {
		expect(markdownToHtml(`${UNSAFE}\n\n${SAFE}`)).toBe(
			`<p>${WORDS}</p>\n<p><a href="https://example.com">web</a> <a href="mailto:a@example.com">mail</a> <a href="tel:+15550100">phone</a> <a href="ftp://example.com/f">files</a></p>`,
		);
	});

	it("are not written to the book", async () => {
		const epub = await createEpubExport(
			chaptersBundle([["a", `${UNSAFE}\n\n${SAFE}`]]),
		);
		expect(await inspectEpub(epub)).toEqual([]);
		const chapter = articleBody(await epubChapter(epub, "a"));
		expect(chapter).toContain(`<p>${WORDS}</p>`);
		expect(chapter).not.toMatch(/script:|data:|file:/);
	});

	it("are reported by the structural check, written plainly or with character references", async () => {
		const epub = await createEpubExport(chaptersBundle([["a", "[x](/y)"]]));
		const zip = await JSZip.loadAsync(epub);
		const path = "OEBPS/text/chapter-a.xhtml";
		const xhtml = (await zip.file(path)?.async("string")) ?? "";
		zip.file(
			path,
			xhtml.replace(
				"<p>x</p>",
				'<p><a href="javascript:alert(1)">a</a> <a href=\'&#106;avascript:alert(1)\'>b</a> <a href="data:text/html,x">c</a> <a href="https://example.com">d</a></p>',
			),
		);
		const tampered = await zip.generateAsync({
			type: "uint8array",
			mimeType: "application/epub+zip",
		});
		const unsafe = (await inspectEpub(tampered)).filter((problem) =>
			problem.includes("an export links only to"),
		);
		expect(unsafe).toEqual([
			`${path} links to "javascript:alert(1)"; an export links only to http, https, mailto, tel, and ftp addresses and to its own pages`,
			`${path} links to "javascript:alert(1)"; an export links only to http, https, mailto, tel, and ftp addresses and to its own pages`,
			`${path} links to "data:text/html,x"; an export links only to http, https, mailto, tel, and ftp addresses and to its own pages`,
		]);
	});
});

describe("unsafe links in the PDF", () => {
	it("keep their words without a link", async () => {
		const pdf = await createPdfExport(
			chaptersBundle([["a", `${UNSAFE}\n\n${SAFE}`]]),
		);
		expect(await inspectPdf(pdf)).toEqual([]);
		expect((await extractPdfLinks(pdf)).map((link) => link.uri)).toEqual([
			"https://example.com",
			"mailto:a@example.com",
			"tel:+15550100",
			"ftp://example.com/f",
		]);
	});

	it("are reported by the structural check", async () => {
		const pdf = await PDFDocument.create();
		const page = pdf.addPage();
		page.drawText("text");
		page.node.addAnnot(
			pdf.context.register(
				pdf.context.obj({
					Type: "Annot",
					Subtype: "Link",
					Rect: [0, 0, 10, 10],
					A: { S: "URI", URI: PDFString.of("javascript:alert(1)") },
				}),
			),
		);
		expect(await inspectPdf(await pdf.save())).toEqual([
			'page 1 links to "javascript:alert(1)"; an export links only to http, https, mailto, tel, and ftp addresses and to its own pages',
		]);
	});
});
