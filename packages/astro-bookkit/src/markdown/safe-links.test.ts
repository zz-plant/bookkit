import { describe, expect, it } from "bun:test";
import { compile } from "@mdx-js/mdx";

import {
	addSafeLinks,
	remarkSafeLinks,
	safeLinksMdastPlugins,
} from "./safe-links";

// What a page of book content may hold: unsafe links written several ways,
// beside links and an image the page keeps. scripts/site-links.test.ts
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

describe("safe links in the site's pages", () => {
	it("keeps the words and drops the address, as a remark plugin under the unified processor", async () => {
		const code = String(
			await compile(MDX, {
				remarkPlugins: [remarkSafeLinks],
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
				remarkPlugins: [remarkSafeLinks],
				jsxImportSource: "astro",
			}),
		);

	for (const [attribute, template, words] of EMBEDS) {
		it(`leaves out an element whose ${attribute} runs code or is computed, keeping what it contains`, async () => {
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

		it(`keeps an element whose ${attribute} is a web address`, async () => {
			const code = await compiled(
				template.replace("%s", '"https://example.com/embed"'),
			);
			expect(code).toContain('"https://example.com/embed"');
		});
	}

	// Attributes no address check can vouch for: a document in srcdoc, a
	// spread, and an SVG animation that rewrites a link's address.
	const UNCHECKABLE = [
		['<iframe srcdoc="<script>alert(1)</script>"></iframe>', ""],
		['<iframe srcDoc={"<script>alert(1)</script>"}></iframe>', ""],
		[
			'<iframe src="https://example.com/embed" srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>',
			"",
		],
		['<iframe {...{ src: "javascript:alert(1)" }}></iframe>', ""],
		[
			'<a {...{ href: "javascript:alert(1)" }}>spread words</a>',
			"spread words",
		],
		["<a {...props}>props words</a>", "props words"],
		[
			'<a href="https://example.com/" {...{ href: "javascript:alert(1)" }}>override words</a>',
			"override words",
		],
		['Before <embed {...{ src: "javascript:alert(1)" }} /> after.', "Before"],
		[
			'<svg><a xlink:href="javascript:alert(1)"><text>svg words</text></a></svg>',
			"svg words",
		],
		[
			'<svg><a href="https://example.com/"><animate attributeName="href" values="javascript:alert(1)" /><text>animated words</text></a></svg>',
			"animated words",
		],
		[
			'<svg><a href="https://example.com/"><set attributeName={name} to="javascript:alert(1)" /><text>set words</text></a></svg>',
			"set words",
		],
	] as const;

	/** What the page renders: the compiled content, without MDX's wrapper. */
	const content = (code: string) =>
		code.slice(
			code.indexOf("function _createMdxContent"),
			code.indexOf("export default function MDXContent"),
		);

	for (const [mdx, words] of UNCHECKABLE) {
		it(`leaves out ${mdx.match(/<(?!svg)[a-z]+[^>]*?(?:srcdoc|\.\.\.|xlink:href|attributeName)/i)?.[0]}…>, keeping what it contains`, async () => {
			const code = content(await compiled(mdx));
			expect(code).not.toMatch(
				/javascript|script&gt|srcdoc|"iframe"|"embed"|"animate"|"set"|xlink|\.\.\.(?!props\.components)/i,
			);
			if (words) expect(code).toContain(`"${words}`);
		});
	}

	it("keeps an SVG animation of anything but an address, and a component's spread props", async () => {
		const code = await compiled(
			'<svg><circle r="1"><animate attributeName="r" values="1;2" /></circle></svg>\n\n<Figure {...props} />',
		);
		expect(code).toContain('"animate"');
		expect(code).toContain('attributeName: "r"');
		expect(code).toMatch(/_jsx\(Figure, \{\s*\.\.\.props/);
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
		expect(addSafeLinks(processor)).toBe(true);
		expect(addSafeLinks(processor)).toBe(true);
		expect(processor.options.mdastPlugins).toEqual(safeLinksMdastPlugins);

		const unified = { name: "unified", options: { remarkPlugins: [] } };
		expect(addSafeLinks(unified)).toBe(true);
		expect(unified.options.remarkPlugins).toEqual([remarkSafeLinks]);

		expect(addSafeLinks({ name: "other", options: {} })).toBe(false);
	});
});
