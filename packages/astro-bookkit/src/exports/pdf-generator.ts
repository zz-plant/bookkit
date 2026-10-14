import {
	type Color,
	PDFDocument,
	type PDFFont,
	PDFHexString,
	PDFName,
	type PDFObject,
	type PDFRef,
	rgb,
	StandardFonts,
} from "pdf-lib";
import { stripMarkdown } from "../utils/markdown";
import { parseMarkdownBlocks } from "./markdown-blocks";
import {
	EXPORT_KIND_LABELS,
	formatExportEdition,
	parseExportDate,
} from "./metadata";
import type { ExportBundle, ExportEntry } from "./types";

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
	// Latin letters with no decomposition to a base letter.
	Ł: "L",
	ł: "l",
	Đ: "D",
	đ: "d",
	Ħ: "H",
	ħ: "h",
	ı: "i",
	Ŧ: "T",
	ŧ: "t",
	"​": "",
	"﻿": "",
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

/**
 * Text the standard fonts can draw. A character with no WinAnsi form becomes
 * "?" and is reported to `onUnsupported`.
 */
export const toWinAnsiText = (
	text: string,
	onUnsupported?: (char: string) => void,
): string => {
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
		onUnsupported?.(char);
		out += "?";
	}
	return out;
};

const codePoint = (char: string) =>
	`U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}`;

const unsupportedTextError = (
	title: string,
	found: Map<string, Set<string>>,
): Error => {
	const lines = [...found].map(([where, chars]) => {
		const sample = [...chars].slice(0, 5);
		const more = chars.size - sample.length;
		return `  - ${where}: ${sample.map((char) => `${char} (${codePoint(char)})`).join(", ")}${more > 0 ? `, and ${more} more` : ""}`;
	});
	return new Error(
		[
			`PDF export of "${title}" stopped: its fonts cover Western European text only (Windows-1252), and these parts of the book use other characters:`,
			...lines,
			"Replace or remove those characters to build the PDF. The EPUB export is not affected.",
		].join("\n"),
	);
};

/** Lines no wider than `maxWidth`; a word longer than a line (a URL, an identifier) is split. */
const wrapText = (
	text: string,
	font: PDFFont,
	size: number,
	maxWidth: number,
): string[] => {
	const fits = (value: string) =>
		font.widthOfTextAtSize(value, size) <= maxWidth;
	const lines: string[] = [];
	let current = "";
	for (const word of text.split(/\s+/).filter(Boolean)) {
		const next = current ? `${current} ${word}` : word;
		if (fits(next)) {
			current = next;
			continue;
		}
		if (current) lines.push(current);
		current = word;
		while (!fits(current)) {
			let cut = current.length - 1;
			while (cut > 1 && !fits(current.slice(0, cut))) cut -= 1;
			lines.push(current.slice(0, cut));
			current = current.slice(cut);
		}
	}
	if (current) lines.push(current);
	return lines;
};

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 52;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const INK = rgb(0.15, 0.15, 0.15);
const HEADING_INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.4, 0.4, 0.4);
const CALLOUT_INK = rgb(0.35, 0.3, 0.7);
const CALLOUT_FILL = rgb(0.96, 0.96, 1.0);

type TextStyle = {
	font: PDFFont;
	size: number;
	lineHeight: number;
	color: Color;
	x: number;
	width: number;
	fill?: Color;
};

/** Where an outline entry or contents line points: a page and the top of its heading. */
type Mark = { pageIndex: number; top: number };
type OutlineNode = { title: string; mark: Mark; children: OutlineNode[] };

const flattenOutline = (
	nodes: OutlineNode[],
	depth = 0,
): Array<{ node: OutlineNode; depth: number }> =>
	nodes.flatMap((node) => [
		{ node, depth },
		...flattenOutline(node.children, depth + 1),
	]);

const countEntries = (entries: ExportEntry[]): number =>
	entries.reduce(
		(total, entry) => total + 1 + countEntries(entry.children ?? []),
		0,
	);

const KIND_NAMES = {
	chapter: "chapter",
	mechanism: "mechanism",
	tool: "toolkit action",
	glossary: "glossary term",
	example: "example",
} as const;

/** The document outline (bookmarks), opened by default so the reader sees the book's structure. */
const addOutline = (pdfDoc: PDFDocument, nodes: OutlineNode[]) => {
	const { context } = pdfDoc;
	const pages = pdfDoc.getPages();
	const destination = (mark: Mark) =>
		context.obj([pages[mark.pageIndex].ref, "XYZ", null, mark.top, null]);
	const addLevel = (items: OutlineNode[], parent: PDFRef) => {
		const refs = items.map(() => context.nextRef());
		let visible = 0;
		items.forEach((item, index) => {
			const fields: Record<string, PDFObject | string | number> = {
				Title: PDFHexString.fromText(item.title),
				Parent: parent,
				Dest: destination(item.mark),
			};
			if (index > 0) fields.Prev = refs[index - 1];
			if (index < refs.length - 1) fields.Next = refs[index + 1];
			if (item.children.length > 0) {
				const children = addLevel(item.children, refs[index]);
				fields.First = children.first;
				fields.Last = children.last;
				fields.Count = children.visible;
				visible += children.visible;
			}
			visible += 1;
			context.assign(refs[index], context.obj(fields));
		});
		return { first: refs[0], last: refs[refs.length - 1], visible };
	};
	const root = context.nextRef();
	const top = addLevel(nodes, root);
	context.assign(
		root,
		context.obj({
			Type: "Outlines",
			First: top.first,
			Last: top.last,
			Count: top.visible,
		}),
	);
	pdfDoc.catalog.set(PDFName.of("Outlines"), root);
	pdfDoc.catalog.set(PDFName.of("PageMode"), PDFName.of("UseOutlines"));
	return destination;
};

export const createPdfExport = async (
	bundle: ExportBundle,
): Promise<Uint8Array> => {
	// No clock reads: metadata comes from the bundle, so unchanged content gives identical bytes.
	const pdfDoc = await PDFDocument.create({ updateMetadata: false });
	pdfDoc.setTitle(bundle.title, { showInWindowTitleBar: true });
	if (bundle.author) pdfDoc.setAuthor(bundle.author);
	pdfDoc.setLanguage(bundle.language?.trim() || "en");
	pdfDoc.setCreator("Bookkit");
	pdfDoc.setProducer("pdf-lib (https://github.com/Hopding/pdf-lib)");
	const released = parseExportDate(bundle.updatedAt);
	if (released) {
		pdfDoc.setCreationDate(released);
		pdfDoc.setModificationDate(released);
	}

	const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
	const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
	const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
	const body: TextStyle = {
		font,
		size: 11,
		lineHeight: 16,
		color: INK,
		x: MARGIN,
		width: CONTENT_WIDTH,
	};

	const unsupported = new Map<string, Set<string>>();
	let where = "the title page";
	const encode = (text: string) =>
		toWinAnsiText(text, (char) => {
			const chars = unsupported.get(where) ?? new Set<string>();
			chars.add(char);
			unsupported.set(where, chars);
		});

	let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
	let y = PAGE_HEIGHT - MARGIN;
	const newPage = () => {
		page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
		y = PAGE_HEIGHT - MARGIN;
	};
	const ensureSpace = (height: number) => {
		if (y - height < MARGIN) newPage();
	};
	const here = (): Mark => ({
		pageIndex: pdfDoc.getPageCount() - 1,
		top: Math.min(PAGE_HEIGHT, y + 24),
	});

	/** Wrapped text, breaking to a new page between any two lines. */
	const drawText = (text: string, style: TextStyle, marker?: string) => {
		const lines = wrapText(encode(text), style.font, style.size, style.width);
		lines.forEach((line, index) => {
			ensureSpace(style.lineHeight);
			if (style.fill) {
				page.drawRectangle({
					x: style.x - 8,
					y: y - style.lineHeight * 0.35,
					width: style.width + 16,
					height: style.lineHeight,
					color: style.fill,
				});
			}
			if (index === 0 && marker) {
				page.drawText(marker, {
					x: style.x - 16,
					y,
					size: style.size,
					font: style.font,
					color: style.color,
				});
			}
			page.drawText(line, {
				x: style.x,
				y,
				size: style.size,
				font: style.font,
				color: style.color,
			});
			y -= style.lineHeight;
		});
	};

	const drawHeading = (text: string, size: number, spaceBelow: number) => {
		const lineHeight = size * 1.3;
		// Keep a heading on the same page as the line after it.
		ensureSpace(lineHeight + spaceBelow + body.lineHeight);
		drawText(stripMarkdown(text), {
			...body,
			font: fontBold,
			size,
			lineHeight,
			color: HEADING_INK,
		});
		y -= spaceBelow;
	};

	const drawMarkdown = (markdown: string) => {
		for (const block of parseMarkdownBlocks(markdown)) {
			if (block.type === "heading") {
				drawHeading(
					block.text,
					block.level <= 2 ? 14 : 12,
					block.level <= 2 ? 8 : 6,
				);
			} else if (block.type === "list") {
				block.items.forEach((item, index) => {
					drawText(
						stripMarkdown(item),
						{ ...body, x: MARGIN + 18, width: CONTENT_WIDTH - 18 },
						block.ordered ? `${index + 1}.` : "•",
					);
					y -= 3;
				});
				y -= 3;
			} else if (block.type === "quote") {
				drawText(stripMarkdown(block.text), {
					...body,
					font: fontItalic,
					color: CALLOUT_INK,
					x: MARGIN + 14,
					width: CONTENT_WIDTH - 28,
					fill: CALLOUT_FILL,
				});
				y -= 6;
			} else {
				drawText(stripMarkdown(block.text), body);
				y -= 6;
			}
		}
	};

	const drawEntry = (entry: ExportEntry, depth: number): OutlineNode => {
		where = `${KIND_NAMES[entry.kind]} "${entry.title}" (${entry.slug})`;
		const compact = entry.kind === "glossary";
		const size = compact ? 13 : depth > 1 ? 15 : 18;
		const label = compact ? null : EXPORT_KIND_LABELS[entry.kind];
		// A top-level entry starts a page when less than half of one is left.
		if (!compact && depth === 1 && y < PAGE_HEIGHT / 2) newPage();
		// The eyebrow's line leaves room for the heading's capitals below it.
		const eyebrowHeight = label ? size + 6 : 0;
		ensureSpace(eyebrowHeight + size * 2.6 + 30);
		const mark = here();
		if (label) {
			drawText(label.toUpperCase(), {
				...body,
				font: fontBold,
				size: 8,
				lineHeight: eyebrowHeight,
				color: MUTED,
			});
		}
		drawHeading(entry.title, size, compact ? 4 : 10);
		drawMarkdown(entry.body);
		y -= compact ? 6 : 14;
		return {
			title: entry.title,
			mark,
			children: (entry.children ?? []).map((child) =>
				drawEntry(child, depth + 1),
			),
		};
	};

	// Title block.
	drawText(bundle.title, {
		...body,
		font: fontBold,
		size: 24,
		lineHeight: 30,
		color: HEADING_INK,
	});
	if (bundle.author) {
		y -= 4;
		drawText(bundle.author, { ...body, size: 13, lineHeight: 18 });
	}
	const edition = formatExportEdition(bundle);
	if (edition) {
		y -= 2;
		drawText(edition, {
			...body,
			font: fontItalic,
			size: 12,
			lineHeight: 18,
			color: MUTED,
		});
	}

	const entryCount = bundle.parts.reduce(
		(total, part) => total + countEntries(part.entries),
		0,
	);
	// A book gets a contents page after its title page; a single chapter flows on.
	const withContents = entryCount > 1;
	if (withContents) newPage();
	else y -= 24;

	const outline: OutlineNode[] = [];
	const showParts = bundle.parts.length > 1;
	bundle.parts.forEach((part, index) => {
		if (!showParts) {
			outline.push(...part.entries.map((entry) => drawEntry(entry, 1)));
			return;
		}
		where = `part "${part.title}"`;
		if (index > 0) newPage();
		const mark = here();
		drawHeading(part.title, 22, 18);
		outline.push({
			title: part.title,
			mark,
			children: part.entries.map((entry) => drawEntry(entry, 1)),
		});
	});

	if (unsupported.size > 0) {
		throw unsupportedTextError(bundle.title, unsupported);
	}

	if (withContents) {
		const rows = flattenOutline(outline);
		const rowHeight = 18;
		const headingSize = 18;
		const headingGap = 12;
		const rowsFrom = (top: number) => Math.floor((top - MARGIN) / rowHeight);
		const firstPageRows = rowsFrom(
			PAGE_HEIGHT - MARGIN - headingSize * 1.3 - headingGap,
		);
		const contentsPages =
			1 +
			Math.max(
				0,
				Math.ceil(
					(rows.length - firstPageRows) / rowsFrom(PAGE_HEIGHT - MARGIN),
				),
			);
		for (let index = 0; index < contentsPages; index += 1) {
			pdfDoc.insertPage(1 + index, [PAGE_WIDTH, PAGE_HEIGHT]);
		}
		for (const { node } of rows) node.mark.pageIndex += contentsPages;

		const destination = addOutline(pdfDoc, outline);
		let contentsPage = 1;
		page = pdfDoc.getPage(contentsPage);
		y = PAGE_HEIGHT - MARGIN;
		drawHeading("Contents", headingSize, headingGap);
		for (const { node, depth } of rows) {
			if (y - rowHeight < MARGIN) {
				contentsPage += 1;
				page = pdfDoc.getPage(contentsPage);
				y = PAGE_HEIGHT - MARGIN;
			}
			const rowFont = showParts && depth === 0 ? fontBold : font;
			const x = MARGIN + depth * 14;
			const pageLabel = String(node.mark.pageIndex + 1);
			const labelWidth = font.widthOfTextAtSize(pageLabel, 11);
			const maxWidth = PAGE_WIDTH - MARGIN - x - labelWidth - 12;
			let title = toWinAnsiText(node.title);
			while (
				title.length > 1 &&
				rowFont.widthOfTextAtSize(title, 11) > maxWidth
			) {
				title = `${title.slice(0, -2)}…`;
			}
			page.drawText(title, { x, y, size: 11, font: rowFont, color: INK });
			page.drawText(pageLabel, {
				x: PAGE_WIDTH - MARGIN - labelWidth,
				y,
				size: 11,
				font,
				color: MUTED,
			});
			const link = pdfDoc.context.register(
				pdfDoc.context.obj({
					Type: "Annot",
					Subtype: "Link",
					Rect: [x, y - 4, PAGE_WIDTH - MARGIN, y + 12],
					Border: [0, 0, 0],
					Dest: destination(node.mark),
				}),
			);
			page.node.addAnnot(link);
			y -= rowHeight;
		}
	} else if (outline.length > 0) {
		addOutline(pdfDoc, outline);
	}

	// Page numbers, matching the contents page.
	pdfDoc.getPages().forEach((numbered, index) => {
		if (index === 0) return;
		const label = String(index + 1);
		numbered.drawText(label, {
			x: (PAGE_WIDTH - font.widthOfTextAtSize(label, 9)) / 2,
			y: MARGIN / 2,
			size: 9,
			font,
			color: MUTED,
		});
	});

	return pdfDoc.save();
};
