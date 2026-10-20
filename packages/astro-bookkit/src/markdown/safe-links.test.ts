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
