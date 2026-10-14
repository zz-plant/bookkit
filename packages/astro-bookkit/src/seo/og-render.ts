import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { engineRequire } from "../utils/engine-require";
import {
	OG_IMAGE_HEIGHT,
	OG_IMAGE_WIDTH,
	type OgCard,
	ogCardFromHtml,
	ogCardTree,
	pagePathForFile,
} from "./og-image";

/**
 * Build-time half of link-preview images: loads fonts, rasterizes cards, and
 * writes one PNG per built page. Node only; `og-image.ts` holds the parts
 * pages import.
 */

/** Font bytes the renderer needs: the book voice at two weights and in italic, and the apparatus. */
export type OgFonts = {
	text: ArrayBuffer;
	textMedium: ArrayBuffer;
	textItalic: ArrayBuffer;
	apparatus: ArrayBuffer;
};

// From the engine's folder, not the bundle's: see utils/engine-require.ts.
const require = engineRequire();

const fontBytes = (specifier: string): ArrayBuffer => {
	const bytes = readFileSync(require.resolve(specifier));
	return bytes.buffer.slice(
		bytes.byteOffset,
		bytes.byteOffset + bytes.byteLength,
	) as ArrayBuffer;
};

/** The reader's typefaces, as static WOFF files (satori reads no WOFF2 or variable fonts). */
export const loadOgFonts = (): OgFonts => ({
	text: fontBytes(
		"@fontsource/newsreader/files/newsreader-latin-400-normal.woff",
	),
	textMedium: fontBytes(
		"@fontsource/newsreader/files/newsreader-latin-500-normal.woff",
	),
	textItalic: fontBytes(
		"@fontsource/newsreader/files/newsreader-latin-400-italic.woff",
	),
	apparatus: fontBytes(
		"@fontsource/fragment-mono/files/fragment-mono-latin-400-normal.woff",
	),
});

type Satori = typeof import("satori").default;
type ResvgModule = typeof import("@resvg/resvg-js");

/**
 * Loaded with `require`, not `import()`: Astro evaluates integrations through
 * Vite's module runner, which has closed by the time `astro:build:done` runs.
 */
const loadRenderer = (): { satori: Satori; Resvg: ResvgModule["Resvg"] } => {
	const satoriModule = require("satori") as Satori | { default: Satori };
	return {
		satori:
			typeof satoriModule === "function" ? satoriModule : satoriModule.default,
		Resvg: (require("@resvg/resvg-js") as ResvgModule).Resvg,
	};
};

export const renderOgImage = async (
	card: OgCard,
	fonts: OgFonts,
): Promise<Uint8Array> => {
	const { satori, Resvg } = loadRenderer();
	const svg = await satori(ogCardTree(card) as never, {
		width: OG_IMAGE_WIDTH,
		height: OG_IMAGE_HEIGHT,
		fonts: [
			{ name: "Newsreader", data: fonts.text, weight: 400, style: "normal" },
			{
				name: "Newsreader",
				data: fonts.textMedium,
				weight: 500,
				style: "normal",
			},
			{
				name: "Newsreader",
				data: fonts.textItalic,
				weight: 400,
				style: "italic",
			},
			{
				name: "Fragment Mono",
				data: fonts.apparatus,
				weight: 400,
				style: "normal",
			},
		],
	});
	return new Resvg(svg, {
		fitTo: { mode: "width", value: OG_IMAGE_WIDTH },
	})
		.render()
		.asPng();
};

/**
 * Renders are cached by content: the card, the fonts, and this renderer's own
 * source. Rebuilding a book re-renders only cards whose page changed.
 */
const rendererDigest = (fonts: OgFonts): string => {
	const hash = createHash("sha256");
	for (const file of ["./og-image.ts", "./og-render.ts"]) {
		const url = new URL(file, import.meta.url);
		if (existsSync(url)) hash.update(readFileSync(url));
	}
	for (const bytes of Object.values(fonts)) hash.update(new Uint8Array(bytes));
	return hash.digest("hex");
};

/**
 * Writes a preview image for every built page that points at a generated
 * one. Pages that name their own image are left alone, and an image already
 * in the output (a file in `public/`) is never overwritten.
 */
export const writeOgImages = async (
	outDir: string,
	{
		cacheDir = join(process.cwd(), "node_modules", ".cache", "bookkit-og"),
	}: { cacheDir?: string | null } = {},
): Promise<{ written: number; rendered: number }> => {
	const files = readdirSync(outDir, { recursive: true }).map(String);
	const cards = new Map<string, OgCard>();
	for (const page of files.filter((file) => file.endsWith(".html"))) {
		const found = ogCardFromHtml(
			readFileSync(join(outDir, page), "utf8"),
			pagePathForFile(page),
		);
		if (found && !cards.has(found.imagePath)) {
			cards.set(found.imagePath, found.card);
		}
	}
	const existing = new Set(files.map((file) => `/${file}`));
	const fonts = loadOgFonts();
	const digest = cacheDir ? rendererDigest(fonts) : "";
	if (cacheDir) mkdirSync(cacheDir, { recursive: true });
	let written = 0;
	let rendered = 0;
	for (const [imagePath, card] of cards) {
		if (existing.has(imagePath)) continue;
		const cached = cacheDir
			? join(
					cacheDir,
					`${createHash("sha256").update(digest).update(JSON.stringify(card)).digest("hex")}.png`,
				)
			: null;
		let png: Uint8Array;
		if (cached && existsSync(cached)) {
			png = readFileSync(cached);
		} else {
			png = await renderOgImage(card, fonts);
			rendered += 1;
			if (cached) writeFileSync(cached, png);
		}
		const target = join(outDir, imagePath);
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, png);
		written += 1;
	}
	return { written, rendered };
};
