import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { bookInitial, renderBookIcons, writeBookIcons } from "./book-icons";

describe("bookInitial", () => {
	it("takes the first letter after a leading article", () => {
		expect(bookInitial("Bad People")).toBe("B");
		expect(bookInitial("The Crumple Zone")).toBe("C");
		expect(bookInitial("an ordinary day")).toBe("O");
		expect(bookInitial("On-Call Runbook")).toBe("O");
	});

	it("keeps a one-word title that is an article", () => {
		expect(bookInitial("The")).toBe("T");
	});

	it("skips leading punctuation", () => {
		expect(bookInitial("“Quoted” Title")).toBe("Q");
	});

	it("explains a title with nothing to draw", () => {
		expect(() => bookInitial("— …")).toThrow(/no letter or digit/);
	});
});

describe("renderBookIcons", () => {
	it("draws Latin Extended initials", async () => {
		const icons = await renderBookIcons("Łódź Notes");
		expect(new TextDecoder().decode(icons.svg)).toContain("<path");
	});

	it("draws the short title's initial and packs three ICO sizes", async () => {
		const icons = await renderBookIcons(
			"The Crumple Zone: How Systems Externalize Harm",
		);
		const svg = new TextDecoder().decode(icons.svg);
		expect(svg).toContain("<title>The Crumple Zone</title>");
		expect(svg).toContain('<path transform="translate(12.30 ');

		const ico = Buffer.from(icons.ico);
		expect(ico.readUInt16LE(2)).toBe(1);
		expect(ico.readUInt16LE(4)).toBe(3);
		expect([ico[6], ico[22], ico[38]]).toEqual([16, 32, 48]);

		const touch = Buffer.from(icons.touch);
		expect(touch.readUInt32BE(16)).toBe(180);
		expect(touch.readUInt32BE(20)).toBe(180);
	});
});

describe("writeBookIcons", () => {
	const builtSite = (head: string) => {
		const dir = mkdtempSync(join(tmpdir(), "bookkit-icons-"));
		writeFileSync(join(dir, "index.html"), `<html><head>${head}</head></html>`);
		return dir;
	};

	it("names the icons for the home page's site name and keeps files from public/", async () => {
		const dir = builtSite(
			'<meta property="og:site_name" content="The Quiet Ledger: Notes">',
		);
		writeFileSync(join(dir, "favicon.svg"), "<svg>mine</svg>");

		expect(await writeBookIcons(dir)).toEqual({ written: 2 });
		expect(readFileSync(join(dir, "favicon.svg"), "utf8")).toBe(
			"<svg>mine</svg>",
		);
		expect(readFileSync(join(dir, "favicon.ico")).readUInt16LE(4)).toBe(3);
		expect(
			readFileSync(join(dir, "apple-touch-icon.png")).length,
		).toBeGreaterThan(1000);
	});

	it("writes nothing when the home page names no book", async () => {
		expect(await writeBookIcons(builtSite(""))).toEqual({ written: 0 });
	});

	it("ships without icons, and says why, when Newsreader lacks the initial", async () => {
		const dir = builtSite('<meta property="og:site_name" content="日本の本">');
		const result = await writeBookIcons(dir);
		expect(result.written).toBe(0);
		expect(result.skipped).toMatch(/no "日"/);
	});
});
