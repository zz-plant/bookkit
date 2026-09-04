import { PDFDocument, type PDFFont, rgb, StandardFonts } from "pdf-lib";
import { stripMarkdown } from "../utils/markdown";
import type { ExportBundle } from "./types";

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
		const lines = wrapText(text, fontBold, size, contentWidth);
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

	const drawParagraph = (text: string, isBullet = false) => {
		const indent = isBullet ? 14 : 0;
		const bulletChar = isBullet ? "• " : "";
		const cleanText = stripMarkdown(text).trim();
		if (!cleanText) return;

		const lines = wrapText(cleanText, font, 11, contentWidth - indent);
		const lineHeight = 16;
		ensureSpace(lines.length * lineHeight + 8);

		lines.forEach((line, idx) => {
			const prefix = idx === 0 && isBullet ? bulletChar : "";
			currentPage.drawText(`${prefix}${line}`, {
				x: margin + indent,
				y: cursorY,
				size: 11,
				font,
				color: rgb(0.15, 0.15, 0.15),
			});
			cursorY -= lineHeight;
		});
		cursorY -= 6;
	};

	// Title page / Cover section
	drawHeading(bundle.title, 24, 8);
	const updated = bundle.updatedAt ?? new Date().toISOString().slice(0, 10);
	const metaLine = `Version ${bundle.version ?? "draft"} • Exported ${updated}`;
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
