import { describe, expect, it } from "bun:test";
import { compile } from "@mdx-js/mdx";

import { UNSAFE_HTML } from "./fixtures/unsafe-html";
import {
	createHeadingSlugger,
	findUnsafeMarkup,
	smartDashes,
	splitFencedCode,
	stripMarkdown,
	toMdxBody,
	type UnsafeMarkup,
	withoutUnsafeMarkup,
} from "./markdown";

/** A finding in brief: its line, what it is, and why or what it keeps. */
const brief = (found: UnsafeMarkup): string => {
	switch (found.kind) {
		case "link":
			return `${found.line} link ${JSON.stringify(found.href)}`;
		case "attribute":
			return `${found.line} <${found.element} ${found.attribute}> ${found.refusal} ${JSON.stringify(found.value)}`;
		case "element":
			return `${found.line} <${found.element}> keeps ${found.keeps}`;
		default:
			return `${found.line} ${found.kind} ${JSON.stringify(found.source)}`;
	}
};

const listed = (markdown: string, tags?: "jsx" | "html") =>
	findUnsafeMarkup(markdown, { tags }).map(brief);

// Markdown as real exports write it: placeholders, raw HTML, comments, autolinks.
const HAZARDS = [
	"# Restart the {service}",
	"",
	"<!-- owner: platform team {temp} -->",
	"Page <on-call-lead> if the queue exceeds {limit}.",
	"See <https://example.com/runbooks> and <https://example.com/a?b=c>.",
	"Line one<br>line two, and an empty fragment <> here.",
	"<details><summary>More</summary>hidden</details>",
	"Use `kubectl get {pods}` and ``a `{x}` b`` inline.",
	"",
	"```sh",
	"curl https://x/{id} # <!-- not a comment -->",
	"```",
	"",
	"    indented {text} is prose in MDX",
].join("\n");

describe("toMdxBody", () => {
	it("produces a body MDX compiles", async () => {
		await expect(compile(HAZARDS)).rejects.toThrow();
		const { body } = toMdxBody(HAZARDS);
		await expect(compile(body)).resolves.toBeDefined();
	});

	it("leaves code exactly as written", () => {
		const { body } = toMdxBody(HAZARDS);
		expect(body).toContain("`kubectl get {pods}`");
		expect(body).toContain("``a `{x}` b``");
		expect(body).toContain("curl https://x/{id} # <!-- not a comment -->");
	});

	it("says what it changed", () => {
		const { body, changes } = toMdxBody(HAZARDS);
		expect(changes.htmlComments).toBe(1);
		expect(changes.autolinks).toBe(2);
		expect(changes.braces).toBe(6);
		expect(changes.tags).toBe(6);
		expect(body).toContain("{/* owner: platform team {temp} */}");
		expect(body).toContain(
			"[https://example.com/runbooks](https://example.com/runbooks)",
		);
		expect(body).toContain("Line one<br />line two");
	});

	it("changes nothing in plain Markdown", () => {
		const plain = "# Title\n\nSome *prose* with a [link](https://x.y).\n";
		expect(toMdxBody(plain)).toEqual({
			body: plain,
			changes: {
				htmlComments: 0,
				braces: 0,
				autolinks: 0,
				tags: 0,
				html: 0,
				esm: 0,
				titles: 0,
			},
			unsafeMarkup: [],
		});
	});

	it("escapes every < that MDX would read as a tag, and import/export lines", async () => {
		const prose =
			"Latency <200ms, a <= b, x <- y, a <3 b, and a < b.\nexport the data first\n";
		await expect(compile(prose)).rejects.toThrow();
		const { body, changes } = toMdxBody(prose);
		await expect(compile(body)).resolves.toBeDefined();
		expect(body).toContain(
			"Latency \\<200ms, a \\<= b, x \\<- y, a \\<3 b, and a < b.",
		);
		expect(body).toContain("&#101;xport the data first");
		expect(changes).toMatchObject({ tags: 4, esm: 1 });
	});
});

// A collapsible section as GitHub renders it, with code inside.
const DETAILS = [
	"<details><summary>Timeline</summary>",
	"",
	"- 02:10 pager",
	"- 04:15 resolved",
	"",
	"```",
	"grep {id} <log>",
	"```",
	"</details>",
	"",
	"Press <KBD>Ctrl</KBD>, see <img src=board.png width=300> and <a href='x' onclick='y()'>this</a>.",
	"A stray </div> and an unclosed <p> stay text.",
].join("\n");

describe("toMdxBody with html: jsx", () => {
	it("keeps common HTML in the form MDX accepts", async () => {
		await expect(compile(DETAILS)).rejects.toThrow();
		const { body, changes } = toMdxBody(DETAILS, { html: "jsx" });
		await expect(compile(body)).resolves.toBeDefined();
		expect(body).toStartWith("<details>\n<summary>Timeline</summary>\n");
		expect(body).toContain("grep {id} <log>");
		expect(body).toContain("<kbd>Ctrl</kbd>");
		expect(body).toContain('<img src="board.png" width="300" />');
		// The link's tags too, once its handler is gone.
		expect(changes.html).toBe(9);
	});

	it("removes event handlers, listing them, and escapes tags it cannot pair", () => {
		const { body, unsafeMarkup } = toMdxBody(DETAILS, { html: "jsx" });
		expect(body).toContain("and <a href='x'>this</a>.");
		expect(unsafeMarkup.map(brief)).toEqual(['11 <a onclick> handler "y()"']);
		expect(body).toContain("A stray \\</div> and an unclosed \\<p> stay text.");
	});

	it("keeps an embedded page with a source, and leaves out one without a source, or with an unsafe one", async () => {
		const { body, changes, unsafeMarkup } = toMdxBody(
			[
				'<iframe src="https://www.youtube.com/embed/abc" title="Video" frameborder="0" allowfullscreen></iframe>',
				"",
				'<iframe src="javascript:alert(1)"></iframe> <iframe src=""></iframe>',
				"",
				'<iframe srcdoc="<b>x</b>" src="https://example.com/embed"></iframe>',
			].join("\n"),
			{ html: "jsx" },
		);
		await expect(compile(body)).resolves.toBeDefined();
		expect(body.split("\n")).toEqual([
			'<iframe src="https://www.youtube.com/embed/abc" title="Video" frameborder="0" allowfullscreen></iframe>',
			"",
			" ",
			"",
			// One with no title is named for the page it shows.
			'<iframe src="https://example.com/embed" title="Embedded page from example.com"></iframe>',
		]);
		expect(changes.html).toBe(4);
		expect(changes.titles).toBe(1);
		expect(unsafeMarkup.map(brief)).toEqual([
			'3 <iframe src> address "javascript:alert(1)"',
			"3 <iframe> keeps nothing",
			'5 <iframe srcdoc> document "<b>x</b>"',
		]);
	});

	it("leaves out a script or a style with what it holds, and a kept element's style, listing each", async () => {
		const note = [
			"<script>alert(1)</script>",
			"",
			'<p align="center" style="position:fixed">Centered</p>',
			"",
			"<STYLE>p { color: red }</STYLE> <scr<script></script>ipt>alert(2)</script>",
		].join("\n");
		const { body, unsafeMarkup } = toMdxBody(note, { html: "jsx" });
		await expect(compile(body)).resolves.toBeDefined();
		expect(body).not.toMatch(/alert|script|style|color/i);
		expect(body).toContain('<p align="center">Centered</p>');
		expect(unsafeMarkup.map(brief)).toEqual([
			"1 <script> keeps nothing",
			'3 <p style> style "position:fixed"',
			"5 <style> keeps nothing",
			"5 <script> keeps nothing",
		]);
	});

	it("ends an address before an escaped tag, which GFM would otherwise read on into", () => {
		const { body } = toMdxBody(
			[
				"GET https://api.example.com/users/<id> or www.example.com/<page>.",
				'<video src="https://example.com/clip.mp4"></video> and https://example.com/ <b>bold</b>',
			].join("\n"),
		);
		expect(body.split("\n")).toEqual([
			"GET https\\://api.example.com/users/\\<id> or www\\.example.com/\\<page>.",
			'\\<video src="https\\://example.com/clip.mp4">\\</video> and https://example.com/ \\<b>bold\\</b>',
		]);
	});

	it("shows the same HTML as text by default", async () => {
		const { body, changes } = toMdxBody(DETAILS);
		await expect(compile(body)).resolves.toBeDefined();
		expect(body).toStartWith("\\<details>\\<summary>Timeline\\</summary>");
		expect(changes.html).toBe(0);
	});
});

describe("findUnsafeMarkup", () => {
	it("finds links, references, definitions, and href attributes the site would not keep, outside code", () => {
		const markdown = [
			'[a](javascript:alert(1)) [b](javascript\\:x) [c [d] e](vbscript:x "T")',
			'![image](data:image/png;base64,AAAA) <a href={"data:text/html,x"}>f</a> <a href={url}>g</a>',
			"`[code](javascript:x)` {/* [comment](javascript:x) */} [h][bad] [ok](https://x.y)",
			"```",
			"[fenced](javascript:x)",
			"```",
			"[bad]: file:///etc/passwd",
		].join("\n");

		expect(listed(markdown)).toEqual([
			'1 link "javascript:alert(1)"',
			'1 link "javascript:x"',
			'1 link "vbscript:x"',
			'2 <a href> address "data:text/html,x"',
			'2 <a href> address "{url}"',
			'3 link "file:///etc/passwd"',
			'7 link "file:///etc/passwd"',
		]);
		expect(withoutUnsafeMarkup(markdown).split("\n").slice(0, 3)).toEqual([
			"a b c [d] e",
			"![image](data:image/png;base64,AAAA) f g",
			"`[code](javascript:x)` {/* [comment](javascript:x) */} h [ok](https://x.y)",
		]);
	});

	it("finds every way into a page that runs script, styles it, or poses as its UI, and leaves out each, keeping the words", () => {
		for (const { attack, mdx, keeps } of UNSAFE_HTML) {
			expect(findUnsafeMarkup(mdx).length, attack).toBeGreaterThan(0);
			const kept = withoutUnsafeMarkup(mdx);
			expect(kept, attack).not.toContain("alert");
			if (keeps) expect(kept, attack).toContain(keeps);
		}
	});

	it("says what each is: an element, an attribute and why, an expression, or code", () => {
		const markdown = [
			'<img src="/a.png" onError="alert(1)" alt="a" /> <p style="color:red" data-x="1">p</p>',
			'<iframe src="https://example.com/v" allow="camera; autoplay" srcdoc="x"></iframe>',
			"<script>{`<img onerror=alert(2)>`}</script> <form><input /><button>Go</button></form>",
			'<svg><circle r="1" /><a href="https://example.com/">svg</a></svg> <div set:html="<b>x</b>" />',
			'Text {name} and {"literal"} and {2} and {/* note */}.',
			"",
			'export const x = "<b>y</b>";',
			"",
			'<Callout kind="note" title={x} {...props} set:html="<b>z</b>">c</Callout>',
		].join("\n");
		expect(listed(markdown)).toEqual([
			'1 <img onerror> handler "alert(1)"',
			'1 <p style> style "color:red"',
			'1 <p data-x> unlisted "1"',
			'2 <iframe allow> permission "camera; autoplay"',
			'2 <iframe srcdoc> document "x"',
			"3 <script> keeps nothing",
			"3 <form> keeps contents",
			"4 <svg> keeps contents",
			'4 <div set:html> raw-html "<b>x</b>"',
			'5 expression "{name}"',
			'7 code "export const x = \\"<b>y</b>\\";"',
			'9 <Callout title> expression "{x}"',
			'9 <Callout {...}> spread "{...props}"',
			'9 <Callout set:html> raw-html "<b>z</b>"',
		]);
	});

	it("reads a tag's case as HTML does, and a capitalized one as a component in MDX", () => {
		expect(
			listed("<sCRIPT>alert(1)</sCRIPT> <svg:script>x</svg:script>"),
		).toEqual(["1 <script> keeps nothing", "1 <svg:script> keeps nothing"]);
		const markdown = '<IFRAME SRC="javascript:alert(1)"></IFRAME>';
		expect(listed(markdown)).toEqual([]);
		expect(listed(markdown, "html")).toEqual([
			'1 <iframe src> address "javascript:alert(1)"',
		]);
	});

	it("in a note, keeps tags it shows as text as written but for an unsafe address, and placeholders as they are", () => {
		const note = [
			'<embed src="javascript:alert(1)"> <object data="&#106;avascript:alert(2)">Fallback</object>',
			'<form action="javascript:alert(3)"><button formaction="vbscript:x">Go</button></form>',
			'<video src="https://example.com/v.mp4" onerror="x"></video> GET /users/<id> and List<String>',
			'<img src="data:image/png;base64,AAAA" alt="kept"> <div action="javascript:x" data-href="y">d</div>',
			"Braces {...x} are text in a note.",
		].join("\n");
		expect(listed(note, "html")).toEqual([
			'1 <embed src> address "javascript:alert(1)"',
			'1 <object data> address "javascript:alert(2)"',
			'2 <form action> address "javascript:alert(3)"',
			'2 <button formaction> address "vbscript:x"',
			'4 <div action> unlisted "javascript:x"',
			'4 <div data-href> unlisted "y"',
		]);
		expect(withoutUnsafeMarkup(note, { tags: "html" }).split("\n")).toEqual([
			"<embed> <object>Fallback</object>",
			"<form><button>Go</button></form>",
			'<video src="https://example.com/v.mp4" onerror="x"></video> GET /users/<id> and List<String>',
			'<img src="data:image/png;base64,AAAA" alt="kept"> <div>d</div>',
			"Braces {...x} are text in a note.",
		]);
	});

	it("lists an element once: not what is inside one left out whole, nor the parts of one left out keeping them", () => {
		expect(
			listed(
				'<template><img onerror="alert(1)" /><script>x</script></template>\n<svg><g><path d="M0" /></g><script>y</script></svg>',
			),
		).toEqual([
			"1 <template> keeps nothing",
			"2 <svg> keeps contents",
			"2 <script> keeps nothing",
		]);
		// What leaving one out joins up is found too.
		expect(
			withoutUnsafeMarkup(
				"<scr<script></script>ipt>alert(1)</script> [[x](javascript:a)](javascript:b)",
				{ tags: "html" },
			),
		).toBe(" x");
	});
});

describe("splitFencedCode", () => {
	it("separates prose from fenced code and says where each starts", () => {
		const segments = splitFencedCode("a\n```\nb\n```\n~~~\nc\n~~~\nd");
		expect(segments).toEqual([
			{ code: false, text: "a", line: 0 },
			{ code: true, text: "```\nb\n```", line: 1 },
			{ code: true, text: "~~~\nc\n~~~", line: 4 },
			{ code: false, text: "d", line: 7 },
		]);
	});

	it("reads a fence indented any amount, as MDX does (a third-level list item's)", () => {
		expect(
			splitFencedCode(
				"- a\n  - b\n    - c\n\n      ```sh\n      x\n      ```\nd",
			),
		).toEqual([
			{ code: false, text: "- a\n  - b\n    - c\n", line: 0 },
			{ code: true, text: "      ```sh\n      x\n      ```", line: 4 },
			{ code: false, text: "d", line: 7 },
		]);
	});

	it("opens no fence at backticks with a backtick after them, and closes none with an info string", () => {
		expect(splitFencedCode("```inline``` code\ntext")).toEqual([
			{ code: false, text: "```inline``` code\ntext", line: 0 },
		]);
		expect(splitFencedCode("```\na\n```js\nb\n```\nc")).toEqual([
			{ code: true, text: "```\na\n```js\nb\n```", line: 0 },
			{ code: false, text: "c", line: 5 },
		]);
	});
});

describe("stripMarkdown", () => {
	it("keeps the text of code spans, without their backticks", () => {
		expect(stripMarkdown("Set `max_retries` and `backoff_ms` first.")).toBe(
			"Set max_retries and backoff_ms first.",
		);
		expect(stripMarkdown("``a `b` c`` and `` `tick` ``")).toBe(
			"a `b` c and `tick`",
		);
		expect(stripMarkdown("**Set `__init__` to `*`**")).toBe(
			"Set __init__ to *",
		);
	});

	it("keeps escaped characters, image alt text, and underscores inside words", () => {
		expect(stripMarkdown("Page \\<on-call-lead\\> about \\*this\\*.")).toBe(
			"Page <on-call-lead> about *this*.",
		);
		expect(stripMarkdown("See ![The board](/b.png) and [docs](/d).")).toBe(
			"See The board and docs.",
		);
		expect(stripMarkdown("Watch error_rate_limit and _emphasis_.")).toBe(
			"Watch error_rate_limit and emphasis.",
		);
	});

	it("leaves tags out, keeping a space where one separates words", () => {
		expect(
			stripMarkdown("Press <kbd>Ctrl</kbd>+<kbd>C</kbd>, then<br/>wait."),
		).toBe("Press Ctrl+C, then wait.");
		expect(stripMarkdown("<p>One</p><p>two</p>")).toBe("One  two");
		expect(stripMarkdown("Note:<Callout>check</Callout>")).toBe("Note: check");
	});

	it("keeps a link's words when its destination holds parentheses", () => {
		expect(
			stripMarkdown("See [the wiki](https://example.com/Foo_(bar)) first."),
		).toBe("See the wiki first.");
	});
});

describe("headings as the site slugs them", () => {
	it("turns runs of hyphens into dashes as smart punctuation does", () => {
		expect(
			[
				"a - b",
				"a -- b",
				"a --- b",
				"a ---- b",
				"a ----- b",
				"a ------- b",
			].map(smartDashes),
		).toEqual(["a - b", "a – b", "a — b", "a –– b", "a —– b", "a —–– b"]);
	});

	it("slugs with github-slugger, numbering repeats", () => {
		const slug = createHeadingSlugger();
		expect(
			[
				smartDashes("Don't -- stop"),
				"Café & crème — 100% (beta)",
				"Tuning max_retries",
				"Tuning max_retries",
			].map(slug),
		).toEqual([
			"dont--stop",
			"café--crème--100-beta",
			"tuning-max_retries",
			"tuning-max_retries-1",
		]);
	});
});
