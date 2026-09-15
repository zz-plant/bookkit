import { PDFDocument, type PDFFont, rgb, StandardFonts } from "pdf-lib";
import { stripMarkdown } from "../utils/markdown";
import type { ExportBundle } from "./types";

/**
 * pdf-lib's standard fonts use WinAnsi encoding and throw on anything outside
 * it. Book content routinely contains arrows, comparison symbols, and emoji,
 * so text is transliterated to the nearest WinAnsi-safe form before drawing
 * rather than letting one character abort the whole export.
 */
const WINANSI_EXTRAS = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

const TRANSLITERATIONS: Readonly<Record<string, string>> = {
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
	"\u200b": "",
	"\ufeff": "",
};

const PICTOGRAPHIC = /\p{Extended_Pictographic}|\p{Emoji_Component}/u;

const isWinAnsi = (char: string): boolean => {
	const codePoint = char.codePointAt(0) ?? 0;
	return (
		(codePoint >= 0x20 && codePoint <= 0x7e) ||
		(codePoint >= 0xa0 && codePoint <= 0xff) ||
		WINANSI_EXTRAS.has(char)
	);
};

export const toWinAnsiText = (text: string): string => {
	let out = "";
	for (const char of text.normalize("NFC")) {
		if (isWinAnsi(char)) {
			out += char;
			continue;
		}
		const mapped = TRANSLITERATIONS[char];
		if (mapped !== undefined) {
			out += mapped;
			continue;
		}
		if (/\s/.test(char)) {
			out += " ";
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
		out += "?";
	}
	return out;
};

const wrapText = (
	text: string,
	font: PDFFont,
	size: number,
	maxWidth: number,
): string[] => {
	const words = text.split(/\s+/);
	const lines: string[] = [];
	let current = "";
	for (const word of words) {
		const next = current ? `${current} ${word}` : word;
		if (font.widthOfTextAtSize(next, size) > maxWidth && current) {
			lines.push(current);
			current = word;
		} else {
			current = next;
		}
	}
	if (current) lines.push(current);
	return lines;
};

export const createPdfExport = async (
	bundle: ExportBundle,
): Promise<Uint8Array> => {
	const pdfDoc = await PDFDocument.create();
	const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
	const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
	const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
	const pageWidth = 595;
	const pageHeight = 842;
	const margin = 52;
	const contentWidth = pageWidth - margin * 2;

	let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
	let cursorY = pageHeight - margin;

	const ensureSpace = (neededHeight: number) => {
		if (cursorY < margin + neededHeight) {
			currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
			cursorY = pageHeight - margin;
		}
	};

	const drawHeading = (text: string, size: number, spaceBelow = 12) => {
		const lines = wrapText(toWinAnsiText(text), fontBold, size, contentWidth);
		const lineHeight = size * 1.3;
		ensureSpace(lines.length * lineHeight + spaceBelow);
		for (const line of lines) {
			currentPage.drawText(line, {
				x: margin,
				y: cursorY,
				size,
				font: fontBold,
				color: rgb(0.1, 0.1, 0.1),
			});
			cursorY -= lineHeight;
		}
		cursorY -= spaceBelow;
	};

	const drawParagraph = (text: string, isBullet = false, isCallout = false) => {
		const rawText = isCallout ? text.replace(/^>\s*/, "") : text;
		const indent = isBullet ? 14 : 0;
		const calloutIndent = isCallout ? 14 : 0;
		const bulletChar = isBullet ? "• " : "";
		const cleanText = toWinAnsiText(stripMarkdown(rawText)).trim();
		if (!cleanText) return;

		const maxWidth = contentWidth - indent - calloutIndent;
		const lines = wrapText(cleanText, font, 11, maxWidth);
		const lineHeight = 16;

		if (isCallout) {
			const totalHeight = lines.length * lineHeight + 8;
			ensureSpace(totalHeight + 12);
			currentPage.drawRectangle({
				x: margin + indent,
				y: cursorY - lines.length * lineHeight - 4,
				width: maxWidth,
				height: totalHeight + 4,
				color: rgb(0.96, 0.96, 1.0),
				borderColor: rgb(0.56, 0.47, 0.9),
				borderWidth: 0,
			});
		} else {
			ensureSpace(lines.length * lineHeight + 8);
		}

		lines.forEach((line, idx) => {
			const prefix = idx === 0 && isBullet ? bulletChar : "";
			const lineText = idx === 0 ? `${prefix}${line}` : line;
			currentPage.drawText(lineText, {
				x: margin + indent + calloutIndent,
				y: cursorY,
				size: 11,
				font: isCallout ? fontItalic : font,
				color: isCallout ? rgb(0.35, 0.3, 0.7) : rgb(0.15, 0.15, 0.15),
			});
			cursorY -= lineHeight;
		});
		cursorY -= 6;
	};

	// Title page / Cover section
	drawHeading(bundle.title, 24, 8);
	const updated = bundle.updatedAt ?? new Date().toISOString().slice(0, 10);
	const metaLine = toWinAnsiText(
		`Version ${bundle.version ?? "draft"} • Exported ${updated}`,
	);
	currentPage.drawText(metaLine, {
		x: margin,
		y: cursorY,
		size: 12,
		font: fontItalic,
		color: rgb(0.4, 0.4, 0.4),
	});
	cursorY -= 32;

	// Render chapters
	for (const chapter of bundle.chapters) {
		// Start chapter on new page if space is low
		if (cursorY < pageHeight / 2) {
			currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
			cursorY = pageHeight - margin;
		}

		drawHeading(chapter.title, 18, 14);

		const rawLines = chapter.body.split("\n");
		let inList = false;

		for (const rawLine of rawLines) {
			const trimmed = rawLine.trim();
			if (!trimmed) {
				inList = false;
				continue;
			}

			const h2Match = trimmed.match(/^##\s+(.*)$/);
			if (h2Match) {
				drawHeading(stripMarkdown(h2Match[1]), 14, 8);
				continue;
			}

			const h3Match = trimmed.match(/^###\s+(.*)$/);
			if (h3Match) {
				drawHeading(stripMarkdown(h3Match[1]), 12, 6);
				continue;
			}

			const calloutMatch = trimmed.match(/^>\s+(.*)$/);
			if (calloutMatch) {
				drawParagraph(trimmed, false, true);
				continue;
			}

			const bulletMatch = trimmed.match(/^[-*]\s+(.*)$/);
			if (bulletMatch) {
				inList = true;
				drawParagraph(bulletMatch[1], true);
				continue;
			}

			drawParagraph(trimmed, false);
		}

		cursorY -= 20;
	}

	return pdfDoc.save();
};
