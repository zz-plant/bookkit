import { describe, expect, it } from "bun:test";
import JSZip from "jszip";
import { UNSAFE_HTML } from "../utils/fixtures/unsafe-html";
import { createEpubExport } from "./epub-generator";
import {
	articleBody,
	chaptersBundle,
	epubChapter,
	pdfPages,
} from "./fixtures/pdf-text";
import { inspectEpub, inspectPdf } from "./inspect";
import { createPdfExport } from "./pdf-generator";

/**
 * The PDF and EPUB hold what the site's page does (`withoutUnsafeMarkup`,
 * the allowlist in utils/html-allowlist.ts): a script leaves no text behind,
 * and no event handler, style, or form reaches the EPUB. The structural
 * check `check:build` runs reports one if a file has it anyway.
 */

const CHAPTER = UNSAFE_HTML.map(({ mdx }) => mdx).join("\n\n");
// The vectors' images are not in a book; the exports show their alt text.
const quiet = { onWarning: () => {} };

describe("raw HTML in the exports", () => {
	it("leaves the EPUB with what the page keeps, and nothing that runs", async () => {
		const epub = await createEpubExport(
			chaptersBundle([["a", CHAPTER]]),
			quiet,
		);
		expect(await inspectEpub(epub)).toEqual([]);
		const chapter = articleBody(await epubChapter(epub, "a"));
		expect(chapter).not.toContain("alert");
		for (const { attack, keeps } of UNSAFE_HTML) {
			// An image's alt is kept as an image; the rest as text.
			if (keeps && !keeps.endsWith("handler") && keeps !== "foreign words") {
				expect(chapter, attack).toContain(keeps);
			}
		}
	});

	it("leaves the PDF without a script's text", async () => {
		const pdf = await createPdfExport(chaptersBundle([["a", CHAPTER]]), quiet);
		expect(await inspectPdf(pdf)).toEqual([]);
		const text = (await pdfPages(pdf)).join("\n");
		expect(text).not.toContain("alert");
		expect(text).toContain("form words");
	});

	it("is reported by the structural check when an EPUB has it anyway", async () => {
		const epub = await createEpubExport(chaptersBundle([["a", "x"]]));
		const zip = await JSZip.loadAsync(epub);
		const path = "OEBPS/text/chapter-a.xhtml";
		const xhtml = (await zip.file(path)?.async("string")) ?? "";
		zip.file(
			path,
			xhtml.replace(
				"<p>x</p>",
				'<p onclick="alert(1)" style="color:red" data-resume-reading="">x</p><script>alert(2)</script><img src="../images/a.png" alt="" onerror="alert(3)"/><nav epub:type="toc"><ol><li>y</li></ol></nav>',
			),
		);
		const tampered = await zip.generateAsync({
			type: "uint8array",
			mimeType: "application/epub+zip",
		});
		expect(
			(await inspectEpub(tampered)).filter((problem) =>
				problem.startsWith(`${path} has <`),
			),
		).toEqual([
			`${path} has <p onclick="alert(1)">; an event handler runs script, and a book's content runs none`,
			`${path} has <p style="color:red">; inline style can restyle or cover the page, which takes its styling from the book's stylesheet`,
			`${path} has <p data-resume-reading="">; the reader UI finds its own parts by data-* attributes, so content carries none`,
			`${path} has <script>; an export holds only the HTML a book's content may, and a book's content runs no script`,
			`${path} has <img onerror="alert(3)">; an event handler runs script, and a book's content runs none`,
		]);
	});
});
