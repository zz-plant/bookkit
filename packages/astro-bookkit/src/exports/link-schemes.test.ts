import { describe, expect, it } from "bun:test";
import JSZip from "jszip";
import { PDFDocument, PDFString } from "pdf-lib";
import { isSafeLink, linkScheme } from "../utils/links";
import { createEpubExport } from "./epub-generator";
import { articleBody, chaptersBundle, epubChapter } from "./fixtures/pdf-text";
import { extractPdfLinks, inspectEpub, inspectPdf } from "./inspect";
import { markdownToHtml } from "./markdown-to-html";
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

// Elements that embed a document or submit a form, each to an address that
// runs code; the exports render none of these elements, only what they hold.
const EMBEDS = [
	'<iframe src="javascript:alert(1)"></iframe>',
	'<embed src="vbscript:msgbox(1)" />',
	'<object data="data:text/html;base64,PHNjcmlwdD4=">object words</object>',
	'<form action="&#106;avascript:alert(2)">form words</form>',
	'<button formaction="javascript:alert(3)">button words</button>',
].join("\n\n");

describe("embedded documents and forms in the exports", () => {
	it("keep what they contain, and none of their addresses, in the EPUB", async () => {
		const epub = await createEpubExport(chaptersBundle([["a", EMBEDS]]));
		expect(await inspectEpub(epub)).toEqual([]);
		const chapter = articleBody(await epubChapter(epub, "a"));
		expect(chapter).not.toMatch(
			/script|data:|<(iframe|embed|object|form|button)\b/,
		);
		for (const words of ["object words", "form words", "button words"]) {
			expect(chapter).toContain(words);
		}
	});

	it("keep what they contain, and none of their addresses, in the PDF", async () => {
		const pdf = await createPdfExport(chaptersBundle([["a", EMBEDS]]));
		expect(await inspectPdf(pdf)).toEqual([]);
		expect(await extractPdfLinks(pdf)).toEqual([]);
	});

	it("are reported by the structural check when a file has one anyway", async () => {
		const epub = await createEpubExport(chaptersBundle([["a", "x"]]));
		const zip = await JSZip.loadAsync(epub);
		const path = "OEBPS/text/chapter-a.xhtml";
		const xhtml = (await zip.file(path)?.async("string")) ?? "";
		zip.file(
			path,
			xhtml.replace(
				"<p>x</p>",
				[
					'<iframe src="javascript:alert(1)"></iframe>',
					'<embed src="vbscript:x"/>',
					"<object data='&#106;avascript:alert(2)'>o</object>",
					'<form action="data:text/html,x"><button formaction="javascript:alert(3)">b</button></form>',
					'<form action="https://example.com/f">ok</form>',
				].join(""),
			),
		);
		const tampered = await zip.generateAsync({
			type: "uint8array",
			mimeType: "application/epub+zip",
		});
		const rule =
			"an export links only to http, https, mailto, tel, and ftp addresses and to its own pages";
		expect(
			(await inspectEpub(tampered)).filter((problem) => problem.includes(rule)),
		).toEqual([
			`${path} has <iframe src="javascript:alert(1)">; ${rule}`,
			`${path} has <embed src="vbscript:x">; ${rule}`,
			`${path} has <object data="javascript:alert(2)">; ${rule}`,
			`${path} has <form action="data:text/html,x">; ${rule}`,
			`${path} has <button formaction="javascript:alert(3)">; ${rule}`,
		]);
	});
});

// Attributes no address check can vouch for: the exports leave out each
// element and keep what it holds, as the site does. The animated link's own
// address is a web address, which stays once its animation is gone.
const UNCHECKABLE = [
	'<iframe srcdoc="<script>alert(1)</script>"></iframe>',
	'<iframe {...{ src: "javascript:alert(2)" }}></iframe>',
	'<a {...{ href: "javascript:alert(3)" }}>spread words</a> and <a href="https://example.com/" {...{ href: "javascript:alert(4)" }}>override words</a>',
	'<kbd {...props}>kbd words</kbd> <img {...{ src: "pic.png" }} alt="spread image" />',
	'<svg><a xlink:href="javascript:alert(5)"><text>svg words</text></a></svg>',
	'<svg><a href="https://example.com/"><animate attributeName="href" values="javascript:alert(6)" /><text>animated words</text></a></svg>',
].join("\n\n");
const UNCHECKABLE_WORDS = [
	"spread words and override words",
	"kbd words",
	"svg words",
	"animated words",
];

describe("srcdoc, spreads, and animated addresses in the exports", () => {
	it("are left out of the EPUB, which keeps what they hold", async () => {
		const epub = await createEpubExport(chaptersBundle([["a", UNCHECKABLE]]));
		expect(await inspectEpub(epub)).toEqual([]);
		const chapter = articleBody(await epubChapter(epub, "a"));
		expect(chapter).not.toMatch(
			/script|srcdoc|\.\.\.|xlink|<(iframe|kbd|img|animate)\b/,
		);
		for (const words of UNCHECKABLE_WORDS) expect(chapter).toContain(words);
		expect(chapter.match(/<a\b[^>]*>/g)).toEqual([
			'<a href="https://example.com/">',
		]);
	});

	it("are left out of the PDF", async () => {
		const pdf = await createPdfExport(chaptersBundle([["a", UNCHECKABLE]]));
		expect(await inspectPdf(pdf)).toEqual([]);
		expect((await extractPdfLinks(pdf)).map((link) => link.uri)).toEqual([
			"https://example.com/",
		]);
	});

	it("are reported by the structural check when an EPUB has one anyway", async () => {
		const epub = await createEpubExport(chaptersBundle([["a", "x"]]));
		const zip = await JSZip.loadAsync(epub);
		const path = "OEBPS/text/chapter-a.xhtml";
		const xhtml = (await zip.file(path)?.async("string")) ?? "";
		zip.file(
			path,
			xhtml.replace(
				"<p>x</p>",
				[
					'<iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>',
					'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><a xlink:href="javascript:alert(2)"><animate attributeName="href" values="javascript:alert(3)"/><text>t</text></a></svg>',
				].join(""),
			),
		);
		const tampered = await zip.generateAsync({
			type: "uint8array",
			mimeType: "application/epub+zip",
		});
		const reported = (await inspectEpub(tampered)).filter((problem) =>
			problem.startsWith(`${path} has <`),
		);
		expect(reported).toEqual([
			`${path} has <iframe srcdoc="<script>alert(1)</script>">; an export holds no document written into an attribute`,
			`${path} has <a xlink:href="javascript:alert(2)">; an export links only to http, https, mailto, tel, and ftp addresses and to its own pages`,
			`${path} has <animate attributename="href">; an export links only to http, https, mailto, tel, and ftp addresses and to its own pages`,
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
