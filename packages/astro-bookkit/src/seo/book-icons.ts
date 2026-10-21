import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { escapeHtml } from "../utils/character-references";
import { engineRequire } from "../utils/engine-require";
import { metaContent } from "./og-image";
import { shortBookTitle } from "./page-meta";

/**
 * A book site's icons: its short title's initial, in the rubric on paper, set
 * in Newsreader. `BookLayout` links all three from the site root; the Bookkit
 * integration draws them after a build, beside the link-preview images. A file
 * of the same name in the book's `public/` wins.
 */
const ICON_FILES = {
	svg: "favicon.svg",
	ico: "favicon.ico",
	touch: "apple-touch-icon.png",
} as const;

type BookIcons = Record<keyof typeof ICON_FILES, Uint8Array>;

const PAPER = "#f7f4ed";
const RUBRIC = "#a3301c";
const RULE = "#3e3c37";
const ICO_SIZES = [16, 32, 48];
const TOUCH_SIZE = 180;

// From the engine's folder, not the bundle's: see utils/engine-require.ts.
const require = engineRequire();

/** The letter a title is known by: its first, after a leading article. */
export const bookInitial = (title: string): string => {
	const words = title.trim().split(/\s+/);
	const rest =
		words.length > 1 && /^(the|a|an)$/i.test(words[0] ?? "")
			? words.slice(1)
			: words;
	const letter = rest.join(" ").match(/\p{L}|\p{N}/u)?.[0];
	if (!letter) {
		throw new Error(
			`Book title "${title}" has no letter or digit to put on its icon. Change the title in book.config.ts, or put your own favicon.svg, favicon.ico and apple-touch-icon.png in the book's public/.`,
		);
	}
	return letter.toLocaleUpperCase("en");
};

type Glyph = { d: string; x: number; y: number; width: number; height: number };

/**
 * Newsreader's Latin, Latin Extended and Vietnamese cuts, at the weight the
 * icon uses. Read on first use, not at import: the engine's entry point
 * re-exports the integration, so this module is bundled into every page, and
 * no page draws an icon.
 */
let iconFonts:
	| Array<{
			name: string;
			weight: 600;
			style: "normal";
			data: Buffer;
	  }>
	| undefined;
const loadIconFonts = () => {
	iconFonts ??= ["latin", "latin-ext", "vietnamese"].map((subset) => ({
		// Satori uses one font per name, so each cut needs its own.
		name: `Newsreader ${subset}`,
		weight: 600 as const,
		style: "normal" as const,
		data: readFileSync(
			require.resolve(
				`@fontsource/newsreader/files/newsreader-${subset}-600-normal.woff`,
			),
		),
	}));
	return iconFonts;
};

/** Lays out one character at 1000px and returns satori's SVG of it. */
const outlineSvg = async (text: string): Promise<string> => {
	const satoriModule = require("satori");
	const satori = satoriModule.default ?? satoriModule;
	const fonts = loadIconFonts();
	return satori(
		{
			type: "div",
			props: {
				style: {
					display: "flex",
					fontFamily: fonts.map((font) => `"${font.name}"`).join(", "),
					fontSize: 1000,
				},
				children: text,
			},
		},
		{ width: 1500, height: 1500, fonts },
	);
};

const pathData = (svg: string) => svg.match(/ d="([^"]+)"/)?.[1];

/**
 * The initial as an outline, so the SVG doesn't depend on the reader's fonts.
 * Satori lays out the text; resvg measures the ink. A letter Newsreader lacks
 * comes back as the font's empty box, so it is compared with one that is
 * certainly missing (a private-use code point).
 */
const glyphOutline = async (letter: string): Promise<Glyph> => {
	const { Resvg } = require("@resvg/resvg-js");
	const svg = await outlineSvg(letter);
	const d = pathData(svg);
	if (!d || d === pathData(await outlineSvg("\uE000"))) {
		throw new Error(
			`Newsreader has no "${letter}", so the icon would be an empty box. Put your own favicon.svg, favicon.ico and apple-touch-icon.png in the book's public/.`,
		);
	}
	const { x, y, width, height } = new Resvg(svg).getBBox();
	return { d, x, y, width, height };
};

/** The outline scaled to fit a `box`-wide square centred on (cx, cy). */
const placedGlyph = (glyph: Glyph, box: number, cx: number, cy: number) => {
	const scale = box / Math.max(glyph.width, glyph.height);
	const tx = cx - (glyph.x + glyph.width / 2) * scale;
	const ty = cy - (glyph.y + glyph.height / 2) * scale;
	return `<path transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(5)})" fill="${RUBRIC}" d="${glyph.d}"/>`;
};

/** Packs PNGs into an ICO container (PNG-compressed entries, Vista and later). */
const icoFromPngs = (pngs: { size: number; png: Uint8Array }[]): Uint8Array => {
	const header = Buffer.alloc(6 + 16 * pngs.length);
	header.writeUInt16LE(1, 2);
	header.writeUInt16LE(pngs.length, 4);
	let offset = header.length;
	pngs.forEach(({ size, png }, index) => {
		const entry = 6 + 16 * index;
		header.writeUInt8(size % 256, entry);
		header.writeUInt8(size % 256, entry + 1);
		header.writeUInt16LE(1, entry + 4);
		header.writeUInt16LE(32, entry + 6);
		header.writeUInt32LE(png.length, entry + 8);
		header.writeUInt32LE(offset, entry + 12);
		offset += png.length;
	});
	return new Uint8Array(Buffer.concat([header, ...pngs.map((p) => p.png)]));
};

/** Renders from the book's title; a subtitle after a colon is left off. */
export const renderBookIcons = async (title: string): Promise<BookIcons> => {
	const { Resvg } = require("@resvg/resvg-js");
	const name = shortBookTitle(title);
	const glyph = await glyphOutline(bookInitial(name));
	const rasterize = (svg: string, size: number): Uint8Array =>
		new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();

	// The tab icon: a rounded tile, the initial at 62% of it.
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><title>${escapeHtml(name)}</title><rect width="64" height="64" rx="12" fill="${PAPER}"/>${placedGlyph(glyph, 39.68, 32, 32)}</svg>\n`;

	// The home-screen icon: full bleed (iOS rounds it), the initial over a rule.
	const half = TOUCH_SIZE / 2;
	const touch = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TOUCH_SIZE} ${TOUCH_SIZE}"><rect width="${TOUCH_SIZE}" height="${TOUCH_SIZE}" fill="${PAPER}"/>${placedGlyph(glyph, 101, half, half)}<rect x="36" y="155" width="108" height="6" fill="${RULE}"/></svg>`;

	return {
		svg: new TextEncoder().encode(svg),
		ico: icoFromPngs(
			ICO_SIZES.map((size) => ({ size, png: rasterize(svg, size) })),
		),
		touch: rasterize(touch, TOUCH_SIZE),
	};
};

/**
 * Writes the icons into a built site, named for the home page's
 * `og:site_name`. Icons already in the output (files in `public/`) are kept.
 */
export const writeBookIcons = async (
	outDir: string,
): Promise<{ written: number; skipped?: string }> => {
	const kinds = (Object.keys(ICON_FILES) as (keyof BookIcons)[]).filter(
		(kind) => !existsSync(join(outDir, ICON_FILES[kind])),
	);
	const home = join(outDir, "index.html");
	if (kinds.length === 0 || !existsSync(home)) return { written: 0 };
	const html = readFileSync(home, "utf8");
	const title =
		metaContent(html, "og:site_name") ?? metaContent(html, "og:title");
	if (!title) return { written: 0 };
	// An icon is never worth failing a build over: say why, ship without it.
	let icons: BookIcons;
	try {
		icons = await renderBookIcons(title);
	} catch (error) {
		return { written: 0, skipped: (error as Error).message };
	}
	for (const kind of kinds) {
		writeFileSync(join(outDir, ICON_FILES[kind]), icons[kind]);
	}
	return { written: kinds.length };
};
