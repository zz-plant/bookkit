import { describe, expect, it } from "bun:test";
import { compile } from "@mdx-js/mdx";

import { UNSAFE_HTML } from "../utils/fixtures/unsafe-html";
import { addSafeHtml, remarkSafeHtml, safeHtmlMdastPlugins } from "./safe-html";

// What a page of book content may hold: unsafe links written several ways,
// beside links and an image the page keeps. scripts/site-html.test.ts
// builds a real page with Astro's default processor, Sätteri; this compiles
// MDX as the unified processor does.
const MDX = [
	"[js](javascript:alert(1)) [escaped](&#106;avascript:alert(1)) [data](data:text/html;base64,PHNjcmlwdD4=)",
	'<a href="vbscript:msgbox(1)">html</a> <a href={"javascript:alert(2)"}>expression</a> <a href={target}>computed</a>',
	"[reference][bad] [web](https://example.com) <a href='/read/chapters/x'>page</a>",
	"",
	"![chart](data:image/png;base64,iVBORw0KGgo=)",
	"",
	"[bad]: javascript:alert(3)",
].join("\n");

const unsafe = /javascript|vbscript|data:text|target/;

describe("links and raw HTML in the site's pages", () => {
	it("keeps the words and drops the address, as a remark plugin under the unified processor", async () => {
		const code = String(
			await compile(MDX, {
				remarkPlugins: [remarkSafeHtml],
				jsxImportSource: "astro",
			}),
		);
		expect(code).not.toMatch(unsafe);
		for (const word of ["js", "escaped", "data", "html", "expression"]) {
			expect(code).toContain(`"${word}"`);
		}
		expect(code).toContain('"computed"');
		expect(code).toContain('"https://example.com"');
		expect(code).toContain("data:image/png");
	});

	// Each element that embeds a document or submits a form, with an unsafe
	// address, a computed one, and a web address; and what it contains.
	const EMBEDS = [
		["<iframe src>", "<iframe src=%s></iframe>", ""],
		["<embed src>", "Before <embed src=%s /> after.", "Before"],
		["<object data>", "<object data=%s>object words</object>", "object words"],
		["<form action>", "<form action=%s>form words</form>", "form words"],
		[
			"formaction",
			"<button formAction=%s>button words</button>",
			"button words",
		],
	] as const;

	const compiled = async (mdx: string) =>
		String(
			await compile(mdx, {
				remarkPlugins: [remarkSafeHtml],
				jsxImportSource: "astro",
			}),
		);

	for (const [attribute, template, words] of EMBEDS) {
		it(`leaves out an element whose ${attribute} runs code or is computed, keeping what it holds`, async () => {
			for (const address of [
				'"javascript:alert(1)"',
				'"&#106;avascript:alert(1)"',
				"'data:text/html,x'",
				"{target}",
			]) {
				const code = await compiled(template.replace("%s", address));
				expect(code, address).not.toMatch(/javascript|data:text|target/);
				expect(code, address).not.toMatch(
					/"(iframe|embed|object|form|button)"/,
				);
				if (words) expect(code, address).toContain(`"${words}`);
			}
		});

		// Only the embed is an element content may use.
		const kept = attribute === "<iframe src>";
		it(`${kept ? "keeps" : "leaves out"} an element whose ${attribute} is a web address`, async () => {
			const code = await compiled(
				template.replace("%s", '"https://example.com/embed"'),
			);
			if (kept) expect(code).toContain('"https://example.com/embed"');
			else expect(code).not.toContain("example.com");
			if (words) expect(code).toContain(`"${words}`);
		});
	}

	/** What the page renders: the compiled content, without MDX's wrapper. */
	const content = (code: string) =>
		code.slice(
			code.indexOf("function _createMdxContent"),
			code.indexOf("export default function MDXContent"),
		);

	it("leaves out every way into a page that runs script, styles it, or poses as its UI, keeping the words", async () => {
		for (const { attack, mdx, keeps } of UNSAFE_HTML) {
			const code = content(await compiled(mdx));
			expect(code, attack).not.toContain("alert");
			expect(code, attack).not.toMatch(
				/"(script|style|meta|base|link|template|noscript|svg|math|form|input|button|object|embed|video|body|marquee)"|\bon[a-z]+:|\bstyle:|"set:html"|srcdoc|"data-|"xlink:|\bping:/i,
			);
			if (keeps) expect(code, attack).toContain(keeps);
		}
	});

	it("keeps what content may use: Markdown's elements, import's, an embed, and their attributes", async () => {
		const code = content(
			await compiled(
				[
					'<p align="center" id="intro" className="lead" aria-label="Intro">Hi <kbd>Ctrl</kbd> <sub>2</sub></p>',
					'<img src="/images/a.png" alt="A" width="300" loading="lazy" />',
					'<iframe src="https://www.youtube.com/embed/abc" title="Video" allow="autoplay; encrypted-media" allowFullScreen></iframe>',
					'<table><tbody><tr><td colSpan="2" title={"cell"}>c</td></tr></tbody></table>',
				].join("\n\n"),
			),
		);
		for (const kept of [
			'align: "center"',
			'id: "intro"',
			'className: "lead"',
			'"aria-label": "Intro"',
			'"kbd"',
			'"sub"',
			'width: "300"',
			'loading: "lazy"',
			'"iframe"',
			'allow: "autoplay; encrypted-media"',
			"allowFullScreen: true",
			'colSpan: "2"',
			'title: "cell"',
		]) {
			expect(code).toContain(kept);
		}
	});

	it("gives a link that opens a new window rel=noopener, in place of rel=opener", async () => {
		const code = content(
			await compiled(
				'<a href="https://example.com/" target="_blank">new</a> <a href="https://example.com/" target="_blank" rel="opener external">opener</a> <a href="https://example.com/" target="_self">same</a>',
			),
		);
		expect(code.match(/rel: "[^"]*"/g)).toEqual([
			'rel: "noopener"',
			'rel: "external noopener"',
		]);
	});

	it("keeps a component and its plain props, but not set:html, an expression, or a spread", async () => {
		const code = content(
			await compiled(
				'<Figure caption="A chart" set:html="<b>x</b>" items={list} {...props}>Body</Figure>',
			),
		);
		expect(code).toMatch(/_jsx\(Figure, \{\s*caption: "A chart"/);
		expect(code).not.toMatch(/set:html|list|\.\.\.props/);
	});

	it("keeps a comment and a plain literal written as an expression, and leaves out any other, and code", async () => {
		const code = content(
			await compiled(
				'Text {/* a note */} and {"literal"} and {2}, not {name}.\n\nexport const name = "x";',
			),
		);
		expect(code).toContain('"literal"');
		expect(code).toContain("2");
		expect(code).not.toMatch(/\bname\b/);
	});

	it("leaves out an unsafe element inside another one", async () => {
		const code = await compiled(
			'<form action="javascript:alert(1)">\n  <button formAction="vbscript:x">inner</button>\n</form>',
		);
		expect(code).not.toMatch(/javascript|vbscript|"form"|"button"/);
		expect(code).toContain('"inner"');
	});

	it("is added to the book's processor once, and to none it does not know", () => {
		// The shape satteri() from @astrojs/markdown-satteri returns.
		const processor = {
			name: "satteri",
			options: { mdastPlugins: [], hastPlugins: [], features: {} },
		};
		expect(addSafeHtml(processor)).toBe(true);
		expect(addSafeHtml(processor)).toBe(true);
		expect(processor.options.mdastPlugins).toEqual(safeHtmlMdastPlugins);

		const unified = { name: "unified", options: { remarkPlugins: [] } };
		expect(addSafeHtml(unified)).toBe(true);
		expect(unified.options.remarkPlugins).toEqual([remarkSafeHtml]);

		expect(addSafeHtml({ name: "other", options: {} })).toBe(false);
	});
});
