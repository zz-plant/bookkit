/**
 * Renders social-preview.html to social-preview.png beside it: the
 * repository's GitHub social preview, 1280×640 at device scale 1.
 *
 *   bun docs/assets/social-preview.ts
 *
 * It needs the Chromium build the pinned Playwright expects
 * (`bunx playwright install chromium-headless-shell`), or another one named
 * by CHROMIUM_PATH.
 *
 * The typefaces come from the engine's @fontsource dependencies, inlined as
 * data URLs so the file:// page can use them. The render fails, and writes
 * nothing, if a typeface did not load, if any text or box leaves the frame's
 * margins (64px left and right, 48px top and bottom), or if anything inside
 * the runbook card is clipped by it.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const engine = createRequire(
	join(here, "../../packages/astro-bookkit/package.json"),
);
const font = (specifier: string): string =>
	`data:font/woff2;base64,${readFileSync(engine.resolve(specifier)).toString("base64")}`;

const fontFaces = `
@font-face {
	font-family: "Newsreader Variable";
	font-style: normal;
	font-weight: 200 800;
	src: url(${font("@fontsource-variable/newsreader/files/newsreader-latin-opsz-normal.woff2")}) format("woff2-variations");
}
@font-face {
	font-family: "Newsreader Variable";
	font-style: italic;
	font-weight: 200 800;
	src: url(${font("@fontsource-variable/newsreader/files/newsreader-latin-opsz-italic.woff2")}) format("woff2-variations");
}
@font-face {
	font-family: "Fragment Mono";
	font-style: normal;
	font-weight: 400;
	src: url(${font("@fontsource/fragment-mono/files/fragment-mono-latin-400-normal.woff2")}) format("woff2");
}`;

const WIDTH = 1280;
const HEIGHT = 640;
const MARGIN_X = 64;
const MARGIN_Y = 48;

const browser = await chromium.launch(
	process.env.CHROMIUM_PATH
		? { executablePath: process.env.CHROMIUM_PATH }
		: {},
);
try {
	const page = await browser.newPage({
		viewport: { width: WIDTH, height: HEIGHT },
		deviceScaleFactor: 1,
	});
	await page.goto(pathToFileURL(join(here, "social-preview.html")).href);
	await page.addStyleTag({ content: fontFaces });
	const problems = await page.evaluate(
		async ({ width, height, marginX, marginY }) => {
			await document.fonts.ready;
			const found: string[] = [];
			for (const family of [
				'500 40px "Newsreader Variable"',
				'italic 40px "Newsreader Variable"',
				'40px "Fragment Mono"',
			]) {
				await document.fonts.load(family);
				if (!document.fonts.check(family))
					found.push(`typeface not loaded: ${family}`);
			}
			const name = (el: Element) =>
				`${el.tagName.toLowerCase()}${el.className ? `.${el.className}` : ""} "${(el.textContent ?? "").trim().slice(0, 40)}"`;
			// Text boxes, not element boxes: a line's glyphs are what must not be cut.
			const textRects = (el: Element) => {
				const range = document.createRange();
				range.selectNodeContents(el);
				return [...range.getClientRects()];
			};
			const frame = document.querySelector(".frame");
			if (!frame) return ["no .frame element"];
			for (const el of frame.querySelectorAll("*")) {
				for (const r of [el.getBoundingClientRect(), ...textRects(el)]) {
					if (r.width === 0 && r.height === 0) continue;
					if (
						r.left < marginX ||
						r.right > width - marginX ||
						r.top < marginY ||
						r.bottom > height - marginY
					)
						found.push(
							`outside the margins: ${name(el)} at ${Math.round(r.left)},${Math.round(r.top)}–${Math.round(r.right)},${Math.round(r.bottom)}`,
						);
				}
			}
			for (const box of frame.querySelectorAll("[data-contained]")) {
				const outer = box.getBoundingClientRect();
				const style = getComputedStyle(box);
				const inner = {
					left: outer.left + Number.parseFloat(style.borderLeftWidth),
					right: outer.right - Number.parseFloat(style.borderRightWidth),
					top: outer.top + Number.parseFloat(style.borderTopWidth),
					bottom: outer.bottom - Number.parseFloat(style.borderBottomWidth),
				};
				for (const el of box.querySelectorAll("*")) {
					for (const r of textRects(el)) {
						if (
							r.left < inner.left ||
							r.right > inner.right ||
							r.top < inner.top ||
							r.bottom > inner.bottom
						)
							found.push(`clipped by the card: ${name(el)}`);
					}
				}
			}
			return found;
		},
		{ width: WIDTH, height: HEIGHT, marginX: MARGIN_X, marginY: MARGIN_Y },
	);
	if (problems.length > 0) {
		console.error(problems.join("\n"));
		console.error("social-preview.png not written.");
		process.exitCode = 1;
	} else {
		const out = join(here, "social-preview.png");
		await page.screenshot({ path: out, type: "png" });
		console.log(`wrote ${out} (${WIDTH}×${HEIGHT})`);
	}
} finally {
	await browser.close();
}
