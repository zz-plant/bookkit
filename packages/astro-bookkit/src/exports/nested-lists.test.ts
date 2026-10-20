import { describe, expect, it } from "bun:test";
import { createEpubExport } from "./epub-generator";
import { chaptersBundle } from "./fixtures/pdf-text";
import { extractPdfText, inspectEpub, inspectPdf } from "./inspect";
import { markdownToHtml } from "./markdown-to-html";
import { createPdfExport } from "./pdf-generator";

/**
 * Lists nest as CommonMark (and so the site) nests them: an item indented
 * to the text of the item above it belongs to that item, whatever kind of
 * list either is. The EPUB nests <ul> and <ol>; the PDF indents each level.
 */

const THREE_LEVELS = "- one\n  - two\n    - three\n- four";
const MIXED =
	"1. first\n   - nested bullet\n     1. deep\n2. second\n\n3. after a blank line";

describe("nested lists in the EPUB", () => {
	it("nests bulleted lists three levels deep", () => {
		expect(markdownToHtml(THREE_LEVELS)).toBe(
			"<ul><li>one<ul><li>two<ul><li>three</li></ul></li></ul></li><li>four</li></ul>",
		);
	});

	it("nests mixed lists, and a blank line between items keeps the list going", () => {
		expect(markdownToHtml(MIXED)).toBe(
			"<ol><li>first<ul><li>nested bullet<ol><li>deep</li></ol></li></ul></li><li>second</li><li>after a blank line</li></ol>",
		);
	});

	it("starts a numbered list at its first number", () => {
		expect(markdownToHtml("3. three\n4. four")).toBe(
			'<ol start="3"><li>three</li><li>four</li></ol>',
		);
	});

	it("keeps code and later paragraphs indented under an item in that item", () => {
		expect(
			markdownToHtml(
				"1. Run:\n\n   ```sh\n   oncall status\n   ```\n\n   Then check the board,\n   and the queue.\n2. Done",
			),
		).toBe(
			"<ol><li>Run:<pre><code>oncall status</code></pre><p>Then check the board, and the queue.</p></li><li>Done</li></ol>",
		);
	});

	it("nests by tabs, and does not nest an item short of the text above it", () => {
		expect(markdownToHtml("- a\n\t- b")).toBe(
			"<ul><li>a<ul><li>b</li></ul></li></ul>",
		);
		// "- b" sits two columns in; "1. a"'s text starts at three.
		expect(markdownToHtml("1. a\n  - b")).toBe(
			"<ol><li>a</li></ol>\n<ul><li>b</li></ul>",
		);
	});

	it("ends the list at unindented text after a blank line", () => {
		expect(markdownToHtml("- a\n  - b\n\nAfter.")).toBe(
			"<ul><li>a<ul><li>b</li></ul></li></ul>\n<p>After.</p>",
		);
	});

	it("passes the structural check", async () => {
		const epub = await createEpubExport(
			chaptersBundle([["lists", `${THREE_LEVELS}\n\n${MIXED}`]]),
		);
		expect(await inspectEpub(epub)).toEqual([]);
	});
});

describe("nested lists in the PDF", () => {
	it("indents each level, with its own bullet, and numbers each list from its start", async () => {
		const pdf = await createPdfExport(
			chaptersBundle([
				["lists", `${THREE_LEVELS}\n\n${MIXED}\n\nThen:\n\n7. seven`],
			]),
		);
		expect(await inspectPdf(pdf)).toEqual([]);
		const runs = (await extractPdfText(pdf)).flat();
		const textX = (text: string) => runs.find((run) => run.text === text)?.x;
		// The text of each level starts 18 points further in.
		expect(["one", "two", "three", "four"].map(textX)).toEqual([
			70, 88, 106, 70,
		]);
		expect(["first", "nested bullet", "deep", "second"].map(textX)).toEqual([
			70, 88, 106, 70,
		]);
		// Markers sit 16 points before their text: bullets alternate by depth.
		const markers = runs
			.filter((run) => /^(•|–|\d+\.)$/.test(run.text))
			.map((run) => `${run.text}@${run.x}`);
		expect(markers).toEqual([
			"•@54",
			"–@72",
			"•@90",
			"•@54",
			"1.@54",
			"–@72",
			"1.@90",
			"2.@54",
			"3.@54",
			"7.@54",
		]);
	});
});
