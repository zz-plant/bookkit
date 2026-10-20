import { readFileSync } from "node:fs";
import type { Font } from "@pdf-lib/fontkit";
import { type PDFDocument, type PDFFont, StandardFonts } from "pdf-lib";
import { engineRequire } from "../utils/engine-require";

/**
 * The PDF's fonts. Text in Windows-1252 (Western European) is drawn in
 * Helvetica, as it always has been. Any other character is drawn in the
 * first font that has it: Noto Sans for Latin Extended, Vietnamese, Greek,
 * and Cyrillic, then the fonts the book adds (`exports.pdfFont`). Those fonts
 * are read only when the text needs them and embedded as subsets, so a
 * Western European book gets exactly the PDF it got before, and a Cyrillic
 * one carries only the glyphs it uses.
 */

/** A font file for the PDF: TrueType, OpenType, or WOFF. */
export type PdfFontFile = {
	/** How messages refer to it, such as its path. */
	name: string;
	bytes: Uint8Array;
};

export type PdfFontStyle = "regular" | "bold" | "italic";

/** The scripts the built-in fonts draw, for messages. */
export const BUILT_IN_PDF_SCRIPTS = "Latin, Greek, and Cyrillic";

const STANDARD_FONTS: Record<PdfFontStyle, StandardFonts> = {
	regular: StandardFonts.Helvetica,
	bold: StandardFonts.HelveticaBold,
	italic: StandardFonts.HelveticaOblique,
};

// Noto Sans as Fontsource ships it (SIL Open Font License 1.1, see
// node_modules/@fontsource/noto-sans/LICENSE): one small file per Unicode
// range and style. Devanagari is left out: it needs glyph positioning that
// pdf-lib does not apply.
const NOTO_RANGES = [
	"latin",
	"latin-ext",
	"vietnamese",
	"greek",
	"greek-ext",
	"cyrillic",
	"cyrillic-ext",
] as const;
const NOTO_STYLES: Record<PdfFontStyle, string> = {
	regular: "400-normal",
	bold: "700-normal",
	italic: "400-italic",
};

// From the engine's folder, not the bundle's: see utils/engine-require.ts.
const require = engineRequire();

type Fontkit = typeof import("@pdf-lib/fontkit");
let fontkit: Fontkit | undefined;
// Required rather than imported: the package's types name `create`, while its
// ES build exports only a default object.
const loadFontkit = (): Fontkit => {
	fontkit ??= require("@pdf-lib/fontkit") as Fontkit;
	return fontkit;
};

const notoFiles = new Map<PdfFontStyle, PdfFontFile[]>();
const builtInFonts = (style: PdfFontStyle): PdfFontFile[] => {
	let files = notoFiles.get(style);
	if (!files) {
		files = NOTO_RANGES.map((range) => {
			const specifier = `@fontsource/noto-sans/files/noto-sans-${range}-${NOTO_STYLES[style]}.woff`;
			return {
				name: `Noto Sans (${range})`,
				bytes: readFileSync(require.resolve(specifier)),
			};
		});
		notoFiles.set(style, files);
	}
	return files;
};

const WINANSI_EXTRAS = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

/** Whether Helvetica draws the character (Windows-1252, as pdf-lib's standard fonts encode). */
export const isWinAnsi = (char: string): boolean => {
	const codePoint = char.codePointAt(0) ?? 0;
	return (
		(codePoint >= 0x20 && codePoint <= 0x7e) ||
		(codePoint >= 0xa0 && codePoint <= 0xff) ||
		WINANSI_EXTRAS.has(char)
	);
};

/** One style's fonts, in the order a character is looked up. */
export type PdfFontChain = {
	/** Helvetica, or its bold or oblique. */
	standard: PDFFont;
	/** Whether a font after Helvetica has the character and can lay it out. */
	covers: (char: string) => boolean;
	/**
	 * Characters a font has but cannot lay out: scripts that need syllable
	 * shaping (Devanagari, Bengali, Khmer, …), which pdf-lib's font engine
	 * does not support.
	 */
	unshaped: ReadonlySet<string>;
	/** Embeds the fonts `text` needs; call before measuring or drawing it. */
	prepare: (text: string) => Promise<void>;
	/** The font that draws the character, once `prepare` has seen it. */
	fontOf: (char: string) => PDFFont;
	/** Whether the font draws a space, so a space between its words stays in its run. */
	hasSpace: (font: PDFFont) => boolean;
};

type Candidate = { file: PdfFontFile; font: Font; embedded?: PDFFont };

export const createPdfFontChain = async (
	pdfDoc: PDFDocument,
	style: PdfFontStyle,
	extraFonts: () => PdfFontFile[] = () => [],
): Promise<PdfFontChain> => {
	const standard = await pdfDoc.embedFont(STANDARD_FONTS[style]);
	const parse = (file: PdfFontFile): Candidate => {
		let font: Font;
		try {
			font = loadFontkit().create(file.bytes);
		} catch (error) {
			throw new Error(
				`${file.name} is not a font file the PDF export can read (TrueType, OpenType, or WOFF): ${error instanceof Error ? error.message : String(error)}`,
			);
		}
		if (typeof font.hasGlyphForCodePoint !== "function") {
			throw new Error(
				`${file.name} is a font collection; the PDF export needs a single font. Extract one font from it (a .ttf or .otf file).`,
			);
		}
		return { file, font };
	};
	let builtIn: Candidate[] | undefined;
	let extra: Candidate[] | undefined;
	const found = new Map<string, Candidate | null>();
	const unshaped = new Set<string>();
	const find = (char: string): Candidate | null => {
		const known = found.get(char);
		if (known !== undefined) return known;
		const codePoint = char.codePointAt(0) ?? 0;
		const has = (candidate: Candidate) =>
			candidate.font.hasGlyphForCodePoint(codePoint);
		builtIn ??= builtInFonts(style).map(parse);
		let candidate = builtIn.find(has);
		if (!candidate) {
			extra ??= extraFonts().map(parse);
			candidate = extra.find(has);
		}
		if (candidate) {
			try {
				candidate.font.layout(char);
			} catch {
				unshaped.add(char);
				candidate = undefined;
			}
		}
		found.set(char, candidate ?? null);
		return candidate ?? null;
	};

	const withSpace = new Set<PDFFont>();
	return {
		standard,
		unshaped,
		hasSpace: (font) => withSpace.has(font),
		covers: (char) => find(char) !== null,
		prepare: async (text) => {
			for (const char of new Set(text)) {
				if (isWinAnsi(char)) continue;
				const candidate = find(char);
				if (!candidate || candidate.embedded) continue;
				pdfDoc.registerFontkit(loadFontkit());
				candidate.embedded = await pdfDoc.embedFont(candidate.file.bytes, {
					subset: true,
				});
				if (candidate.font.hasGlyphForCodePoint(0x20)) {
					withSpace.add(candidate.embedded);
				}
			}
		},
		fontOf: (char) =>
			isWinAnsi(char) ? standard : (find(char)?.embedded ?? standard),
	};
};

/**
 * Text as runs that each draw in one font. A space after a word in another
 * font stays in that font's run, so Cyrillic or Greek prose is not split
 * into one run per word.
 */
export const fontRuns = (
	text: string,
	chain: PdfFontChain,
): Array<{ text: string; font: PDFFont }> => {
	const runs: Array<{ text: string; font: PDFFont }> = [];
	for (const char of text) {
		const last = runs[runs.length - 1];
		const font =
			char === " " && last && chain.hasSpace(last.font)
				? last.font
				: chain.fontOf(char);
		if (last?.font === font) last.text += char;
		else runs.push({ text: char, font });
	}
	return runs;
};

export const widthOfText = (
	text: string,
	chain: PdfFontChain,
	size: number,
): number =>
	fontRuns(text, chain).reduce(
		(width, run) => width + run.font.widthOfTextAtSize(run.text, size),
		0,
	);
