import { describe, expect, it } from "bun:test";
import { compile } from "@mdx-js/mdx";

import {
	createHeadingSlugger,
	findUnsafeLinks,
	smartDashes,
	splitFencedCode,
	stripMarkdown,
	toMdxBody,
} from "./markdown";

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
			},
			unsafeLinks: [],
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
		expect(changes.html).toBe(7);
	});

	it("escapes event handlers and tags it cannot pair", () => {
		const { body } = toMdxBody(DETAILS, { html: "jsx" });
		expect(body).toContain("\\<a href='x' onclick='y()'>this\\</a>");
		expect(body).toContain("A stray \\</div> and an unclosed \\<p> stay text.");
	});

	it("shows the same HTML as text by default", async () => {
		const { body, changes } = toMdxBody(DETAILS);
		await expect(compile(body)).resolves.toBeDefined();
		expect(body).toStartWith("\\<details>\\<summary>Timeline\\</summary>");
		expect(changes.html).toBe(0);
	});
});

describe("findUnsafeLinks", () => {
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

		expect(
			findUnsafeLinks(markdown).map(({ line, href, text }) => ({
				line,
				href,
				text,
			})),
		).toEqual([
			{ line: 1, href: "javascript:alert(1)", text: "a" },
			{ line: 1, href: "javascript:x", text: "b" },
			{ line: 1, href: "vbscript:x", text: "c [d] e" },
			{ line: 2, href: "data:text/html,x", text: "" },
			{ line: 2, href: "{url}", text: "" },
			{ line: 3, href: "file:///etc/passwd", text: "h" },
			{ line: 7, href: "file:///etc/passwd", text: "" },
		]);
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
