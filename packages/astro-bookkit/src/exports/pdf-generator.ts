import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { stripMarkdown } from "../utils/markdown";
import type { ExportBundle } from "./types";

const wrapText = (text: string, font: PDFFont, size: number, maxWidth: number): string[] => {
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

export const createPdfExport = async (bundle: ExportBundle): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 52;

  const addPageWithText = (lines: string[], options?: { title?: string }) => {
    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let cursorY = pageHeight - margin;

    if (options?.title) {
      page.drawText(options.title, { x: margin, y: cursorY, size: 22, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
      cursorY -= 30;
    }

    const fontSize = 12;
    const lineHeight = fontSize * 1.5;
    for (const line of lines) {
      if (cursorY < margin + lineHeight) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        cursorY = pageHeight - margin;
      }
      page.drawText(line, { x: margin, y: cursorY, size: fontSize, font, color: rgb(0.1, 0.1, 0.1) });
      cursorY -= lineHeight;
    }
  };

  const updated = bundle.updatedAt ?? new Date().toISOString().slice(0, 10);
  addPageWithText(wrapText(`Version ${bundle.version ?? "draft"} • ${updated}`, font, 14, pageWidth - margin * 2), { title: bundle.title });

  for (const chapter of bundle.chapters) {
    addPageWithText(wrapText(stripMarkdown(chapter.body), font, 12, pageWidth - margin * 2), { title: chapter.title });
  }

  return pdfDoc.save();
};
