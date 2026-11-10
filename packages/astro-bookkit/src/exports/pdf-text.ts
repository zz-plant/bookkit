import { BUILT_IN_PDF_SCRIPTS, isWinAnsi } from "./pdf-fonts";

/**
 * Which characters the PDF can draw, what it writes for the ones it
 * cannot, and the error that stops the export when a book has text no font
 * draws.
 */

/**
 * Symbols written in ASCII rather than drawn from another font, so prose
 * keeps one typeface: arrows, comparison signs, check marks, and dashes.
 */
const SYMBOLS: Readonly<Record<string, string>> = {
	"→": "->",
	"←": "<-",
	"↔": "<->",
	"↑": "^",
	"↓": "v",
	"⇒": "=>",
	"⇐": "<=",
	"⇔": "<=>",
	"≤": "<=",
	"≥": ">=",
	"≠": "!=",
	"≈": "~",
	"−": "-",
	"∞": "inf",
	"✓": "[x]",
	"✔": "[x]",
	"☑": "[x]",
	"✗": "[ ]",
	"✘": "[ ]",
	"☐": "[ ]",
	"‐": "-",
	"‑": "-",
	"‒": "-",
	"―": "--",
	"′": "'",
	"″": '"',
	ﬁ: "fi",
	ﬂ: "fl",
	"​": "",
	"﻿": "",
};

/** Latin letters with no decomposition to a base letter, for when no font has them. */
const LETTERS: Readonly<Record<string, string>> = {
	Ł: "L",
	ł: "l",
	Đ: "D",
	đ: "d",
	Ħ: "H",
	ħ: "h",
	ı: "i",
	Ŧ: "T",
	ŧ: "t",
};

const PICTOGRAPHIC = /\p{Extended_Pictographic}|\p{Emoji_Component}/u;

/**
 * Text the PDF can draw. Windows-1252 text is kept (Helvetica draws it),
 * symbols with an ASCII form are written that way, and a character another
 * font has (`covers`) is kept. After that, letters lose diacritics no font
 * has and emoji are dropped; anything else becomes "?" and is reported to
 * `onUnsupported`.
 */
export const encodePdfText = (
	text: string,
	covers: (char: string) => boolean = () => false,
	onUnsupported?: (char: string) => void,
): string => {
	let out = "";
	for (const char of text.normalize("NFC")) {
		if (isWinAnsi(char)) {
			out += char;
			continue;
		}
		const symbol = SYMBOLS[char];
		if (symbol !== undefined) {
			out += symbol;
			continue;
		}
		if (/\s/.test(char)) {
			out += " ";
			continue;
		}
		if (covers(char)) {
			out += char;
			continue;
		}
		const letter = LETTERS[char];
		if (letter !== undefined) {
			out += letter;
			continue;
		}
		// Letters with unsupported diacritics keep their base letter.
		const base = char.normalize("NFD")[0];
		if (base && base !== char && isWinAnsi(base)) {
			out += base;
			continue;
		}
		// Emoji are decorative in prose; anything else unrepresentable is marked.
		if (PICTOGRAPHIC.test(char)) continue;
		onUnsupported?.(char);
		out += "?";
	}
	return out;
};

/** Text Helvetica alone can draw: `encodePdfText` with no other fonts. */
export const toWinAnsiText = (
	text: string,
	onUnsupported?: (char: string) => void,
): string => encodePdfText(text, undefined, onUnsupported);

const codePoint = (char: string) =>
	`U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}`;

export const unsupportedTextError = (
	title: string,
	found: Map<string, Set<string>>,
	hasBookFonts: boolean,
	unshaped: ReadonlySet<string>,
): Error => {
	const listed = (chars: Iterable<string>) => {
		const all = [...chars];
		const sample = all.slice(0, 5);
		const more = all.length - sample.length;
		return `${sample.map((char) => `${char} (${codePoint(char)})`).join(", ")}${more > 0 ? `, and ${more} more` : ""}`;
	};
	const lines = [...found].map(
		([where, chars]) => `  - ${where}: ${listed(chars)}`,
	);
	const all = new Set([...found.values()].flatMap((chars) => [...chars]));
	const missing = [...all].filter((char) => !unshaped.has(char));
	const shapeless = [...all].filter((char) => unshaped.has(char));
	const notes: string[] = [];
	if (missing.length > 0) {
		notes.push(
			`${shapeless.length > 0 ? `No font has ${listed(missing)}. ` : ""}The built-in fonts cover ${BUILT_IN_PDF_SCRIPTS} text${hasBookFonts ? ", and the font in exports.pdfFont does not have these either" : ""}. To build the PDF, set exports.pdfFont in book.config.ts to a TrueType or OpenType font file that has them (for Chinese, Japanese, or Korean, a Noto Sans CJK font), or set exports.pdf to false to publish the book without a PDF.`,
		);
	}
	if (shapeless.length > 0) {
		notes.push(
			`The font in exports.pdfFont has ${listed(shapeless)}, but the PDF cannot lay out their script: it needs syllable shaping that the PDF's font engine does not do. Set exports.pdf to false in book.config.ts to publish the book without a PDF.`,
		);
	}
	return new Error(
		[
			`PDF export of "${title}" stopped: none of its fonts can draw these characters:`,
			...lines,
			...notes,
			"The EPUB export is not affected.",
		].join("\n"),
	);
};
