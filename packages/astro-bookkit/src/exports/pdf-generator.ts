import {
	type Color,
	PDFDocument,
	PDFHexString,
	type PDFImage,
	PDFName,
	type PDFObject,
	type PDFRef,
	rgb,
} from "pdf-lib";
import { defaultImageLoader, imageWarning, warnWith } from "./images";
import {
	type InlineImage,
	type MarkdownBlock,
	type MarkdownDocument,
	parseMarkdown,
} from "./markdown-blocks";
import {
	createNoteNumbers,
	type InlineNode,
	type NoteNumbers,
	parseInline,
} from "./markdown-inline";
import { imageAltText } from "./markdown-to-html";
import {
	describeExportEntry,
	EXPORT_KIND_LABELS,
	formatExportEdition,
	parseExportDate,
} from "./metadata";
import {
	BUILT_IN_PDF_SCRIPTS,
	createPdfFontChain,
	fontRuns,
	isWinAnsi,
	type PdfFontChain,
	type PdfFontFile,
	type PdfFontStyle,
	widthOfText,
} from "./pdf-fonts";
import {
	breakCodeLine,
	layoutTable,
	type Piece,
	toWords,
	widthOfPieces,
	wrapWords,
} from "./pdf-layout";
import type { ExportBundle, ExportEntry, ExportRenderOptions } from "./types";

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

const unsupportedTextError = (
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

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 52;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const INK = rgb(0.15, 0.15, 0.15);
const HEADING_INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.4, 0.4, 0.4);
const CALLOUT_INK = rgb(0.35, 0.3, 0.7);
const CALLOUT_FILL = rgb(0.96, 0.96, 1.0);
const CODE_FILL = rgb(0.95, 0.95, 0.95);
const TABLE_RULE = rgb(0.75, 0.75, 0.75);
const TABLE_HEAD_FILL = rgb(0.94, 0.94, 0.94);
// Table text, cell padding, and the narrowest column worth drawing as a grid.
const TABLE = { size: 10, lineHeight: 13, padX: 5, padY: 4, minColumn: 36 };

type TextStyle = {
	fonts: PdfFontChain;
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

const IMAGE_FORMAT_NAMES: Record<string, string> = {
	"image/gif": "a GIF",
	"image/svg+xml": "an SVG",
	"image/webp": "a WebP image",
};

/** Read once, however many fonts ask. */
const once = <T>(read: () => T): (() => T) => {
	let value: { result: T } | undefined;
	return () => {
		value ??= { result: read() };
		return value.result;
	};
};

export const createPdfExport = async (
	bundle: ExportBundle,
	options: ExportRenderOptions = {},
): Promise<Uint8Array> => {
	const loadImage = options.loadImage ?? defaultImageLoader();
	const warn = warnWith(options);
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

	const bookFonts: () => PdfFontFile[] = once(options.pdfFonts ?? (() => []));
	const fonts = {
		regular: await createPdfFontChain(pdfDoc, "regular", bookFonts),
		bold: await createPdfFontChain(pdfDoc, "bold", bookFonts),
		italic: await createPdfFontChain(pdfDoc, "italic", bookFonts),
	};
	// Courier joins the PDF only when its text has code, so a PDF without
	// code embeds exactly the fonts it did before.
	const monoFonts = new Map<PdfFontStyle, PdfFontChain>();
	/** The fonts for code in text set in `base`: Courier, or Courier Bold in bold text. */
	const monoFor = async (base: PdfFontChain): Promise<PdfFontChain> => {
		const style: PdfFontStyle = base === fonts.bold ? "monoBold" : "mono";
		let chain = monoFonts.get(style);
		if (!chain) {
			chain = await createPdfFontChain(pdfDoc, style, bookFonts);
			monoFonts.set(style, chain);
		}
		return chain;
	};
	const body: TextStyle = {
		fonts: fonts.regular,
		size: 11,
		lineHeight: 16,
		color: INK,
		x: MARGIN,
		width: CONTENT_WIDTH,
	};

	const unsupported = new Map<string, Set<string>>();
	let where = "the title page";
	const encode = (text: string, chain: PdfFontChain) =>
		encodePdfText(text, chain.covers, (char) => {
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

	/** One line of pieces from `x` on `baseline`, each run in the font that has its characters. */
	const drawPieces = (
		line: Piece[],
		x: number,
		baseline: number,
		color: Color,
	) => {
		let at = x;
		for (const piece of line) {
			for (const run of fontRuns(piece.text, piece.fonts)) {
				page.drawText(run.text, {
					x: at,
					y: baseline + (piece.rise ?? 0),
					size: piece.size,
					font: run.font,
					color,
				});
				at += run.font.widthOfTextAtSize(run.text, piece.size);
			}
		}
	};

	/** One line of text in one style, on the current line. */
	const drawLine = (
		line: string,
		x: number,
		style: Pick<TextStyle, "fonts" | "size" | "color">,
	) =>
		drawPieces(
			[{ text: line, fonts: style.fonts, size: style.size }],
			x,
			y,
			style.color,
		);

	/** The band behind a line of a quote or a code block. */
	const drawFill = (style: TextStyle) => {
		if (!style.fill) return;
		page.drawRectangle({
			x: style.x - 8,
			y: y - style.lineHeight * 0.35,
			width: style.width + 16,
			height: style.lineHeight,
			color: style.fill,
		});
	};

	/** Pieces as the PDF can draw them (see encodePdfText), with the fonts they need embedded. */
	const preparePieces = async (pieces: Piece[]): Promise<Piece[]> => {
		const prepared: Piece[] = [];
		for (const piece of pieces) {
			const text = encode(piece.text, piece.fonts);
			await piece.fonts.prepare(text);
			prepared.push({ ...piece, text });
		}
		return prepared;
	};

	/** Wrapped text in mixed fonts, breaking to a new page between any two lines. */
	const drawPiecesWrapped = async (
		pieces: Piece[],
		style: TextStyle,
		marker?: string,
	) => {
		const lines = wrapWords(toWords(await preparePieces(pieces)), style.width);
		lines.forEach((line, index) => {
			ensureSpace(style.lineHeight);
			drawFill(style);
			if (index === 0 && marker) {
				page.drawText(marker, {
					x: style.x - 16,
					y,
					size: style.size,
					font: style.fonts.standard,
					color: style.color,
				});
			}
			drawPieces(line, style.x, y, style.color);
			y -= style.lineHeight;
		});
	};

	/** Wrapped text in one style. */
	const drawText = (text: string, style: TextStyle, marker?: string) =>
		drawPiecesWrapped(
			[{ text, fonts: style.fonts, size: style.size }],
			style,
			marker,
		);

	/** The entry being drawn, and the numbers its footnotes have been given. */
	type Flow = { entry: ExportEntry; notes: NoteNumbers };

	/**
	 * Inline Markdown as pieces in `style`: code in Courier, a footnote
	 * reference as a raised number. Emphasis and links keep their words;
	 * raw HTML and JSX tags are left out. Images come back as they are.
	 */
	const flowPieces = async (
		nodes: InlineNode[],
		style: TextStyle,
		flow: Flow,
	): Promise<Array<Piece | InlineImage>> => {
		const out: Array<Piece | InlineImage> = [];
		const walk = async (list: InlineNode[]) => {
			for (const node of list) {
				if (node.type === "text") {
					out.push({ text: node.text, fonts: style.fonts, size: style.size });
				} else if (node.type === "code") {
					const mono = await monoFor(style.fonts);
					out.push({ text: node.text, fonts: mono, size: style.size });
				} else if (node.type === "noteref") {
					out.push({
						text: String(flow.notes.refer(node.label).number),
						fonts: style.fonts,
						size: style.size * 0.65,
						rise: style.size * 0.35,
					});
				} else if (node.type === "image") {
					out.push(node.image);
				} else if (node.type !== "html") {
					await walk(node.children);
				}
			}
		};
		await walk(nodes);
		return out;
	};

	const drawHeading = async (
		content: string | { nodes: InlineNode[]; flow: Flow },
		size: number,
		spaceBelow: number,
	) => {
		const lineHeight = size * 1.3;
		// Keep a heading on the same page as the line after it.
		ensureSpace(lineHeight + spaceBelow + body.lineHeight);
		const style: TextStyle = {
			...body,
			fonts: fonts.bold,
			size,
			lineHeight,
			color: HEADING_INK,
		};
		if (typeof content === "string") await drawText(content, style);
		else await drawProse(content.nodes, style, content.flow);
		y -= spaceBelow;
	};

	// One embedded copy per image file, however often it is shown.
	const embedded = new Map<string, PDFImage | string>();
	/** The image to draw, or null (after a warning) when the PDF shows its alt text. */
	const embedImage = async (
		image: InlineImage,
		entry: ExportEntry,
	): Promise<PDFImage | null> => {
		const fallBack = (problem: string, fix: string) => {
			warn(imageWarning({ format: "PDF", entry, image, problem, fix }));
			return null;
		};
		const result = loadImage(image.src, entry);
		if ("problem" in result) return fallBack(result.problem, result.fix);
		const { file } = result;
		const formatName = IMAGE_FORMAT_NAMES[file.mediaType];
		if (formatName) {
			return fallBack(
				`is ${formatName}, and the PDF embeds PNG and JPEG images only`,
				"Link a PNG or JPEG copy to show the image in the PDF.",
			);
		}
		let pdfImage = embedded.get(file.key);
		if (pdfImage === undefined) {
			try {
				pdfImage =
					file.mediaType === "image/png"
						? await pdfDoc.embedPng(file.bytes)
						: await pdfDoc.embedJpg(file.bytes);
			} catch (error) {
				pdfImage = error instanceof Error ? error.message : String(error);
			}
			embedded.set(file.key, pdfImage);
		}
		return typeof pdfImage === "string"
			? fallBack(
					`could not be read (${pdfImage})`,
					"Open the file and save it again as a PNG or JPEG.",
				)
			: pdfImage;
	};

	/** An image as a block of its own, at 96 pixels to the inch but never wider than the text or taller than a page. */
	const drawImage = (pdfImage: PDFImage, style: TextStyle) => {
		const scale = Math.min(
			0.75,
			style.width / pdfImage.width,
			(PAGE_HEIGHT - MARGIN * 2) / pdfImage.height,
		);
		const width = pdfImage.width * scale;
		const height = pdfImage.height * scale;
		// The image's top sits where the top of a line of text would.
		const top = () => y + style.size * 0.75;
		if (top() - height < MARGIN) newPage();
		page.drawImage(pdfImage, { x: style.x, y: top() - height, width, height });
		y = top() - height - style.lineHeight;
	};

	/**
	 * Text that may show images. An image the PDF embeds is drawn as a block
	 * between the text around it; any other image's alt text stays in the line.
	 */
	const drawProse = async (
		nodes: InlineNode[],
		style: TextStyle,
		flow: Flow,
		marker?: string,
	) => {
		let pending: Piece[] = [];
		let lead = marker;
		const flush = async () => {
			if (pending.some((piece) => piece.text.trim())) {
				await drawPiecesWrapped(pending, style, lead);
			}
			pending = [];
			lead = undefined;
		};
		for (const part of await flowPieces(nodes, style, flow)) {
			if (!("src" in part)) {
				pending.push(part);
				continue;
			}
			const pdfImage = await embedImage(part, flow.entry);
			if (pdfImage) {
				await flush();
				drawImage(pdfImage, style);
			} else if (part.alt.trim()) {
				pending.push({
					text: imageAltText(part),
					fonts: style.fonts,
					size: style.size,
				});
			}
		}
		await flush();
	};

	/** A fenced code block: Courier on a grey band, its line breaks and indentation kept. */
	const drawCode = async (code: string) => {
		const style: TextStyle = {
			...body,
			fonts: await monoFor(fonts.regular),
			size: 9.5,
			lineHeight: 13,
			x: MARGIN + 8,
			width: CONTENT_WIDTH - 16,
			fill: CODE_FILL,
		};
		for (const source of code.replaceAll("\t", "    ").split("\n")) {
			const [line] = await preparePieces([
				{ text: source, fonts: style.fonts, size: style.size },
			]);
			// A line wider than the page continues on the next line.
			for (const part of breakCodeLine(
				line.text,
				style.fonts,
				style.size,
				style.width,
			)) {
				ensureSpace(style.lineHeight);
				drawFill(style);
				drawPieces([{ ...line, text: part }], style.x, y, style.color);
				y -= style.lineHeight;
			}
		}
	};

	/**
	 * A table as a grid as wide as its content allows, never wider than the
	 * text: cells wrap, and the header row repeats on each page the table
	 * continues to. When a column would be too narrow to read, or a row taller
	 * than a page, each row is written out as "Header: value" lines instead.
	 */
	const drawTable = async (
		block: Extract<MarkdownBlock, { type: "table" }>,
		document: MarkdownDocument,
		flow: Flow,
	) => {
		const { size, lineHeight, padX, padY } = TABLE;
		const cellStyle: TextStyle = { ...body, size, lineHeight };
		const headStyle: TextStyle = { ...cellStyle, fonts: fonts.bold };
		const cellPieces = async (text: string, style: TextStyle) => {
			const pieces: Piece[] = [];
			const parts = await flowPieces(parseInline(text, document), style, flow);
			for (const part of parts) {
				if (!("src" in part)) {
					pieces.push(part);
					continue;
				}
				warn(
					imageWarning({
						format: "PDF",
						entry: flow.entry,
						image: part,
						problem: "is in a table cell, where the PDF does not draw images",
						fix: "Move the image out of the table to show it in the PDF.",
					}),
				);
				if (part.alt.trim()) {
					pieces.push({ text: imageAltText(part), fonts: style.fonts, size });
				}
			}
			return preparePieces(pieces);
		};
		// In reading order, so footnote references are numbered as they are read.
		const header: Piece[][] = [];
		for (const cell of block.header) {
			header.push(await cellPieces(cell, headStyle));
		}
		const rows: Piece[][][] = [];
		for (const row of block.rows) {
			const cells: Piece[][] = [];
			for (const cell of row) cells.push(await cellPieces(cell, cellStyle));
			rows.push(cells);
		}

		const layout = layoutTable(
			[header, ...rows],
			CONTENT_WIDTH - padX * 2 * header.length,
			TABLE,
		);
		const fitsPages = layout?.heights.every(
			(height) => layout.heights[0] + height <= PAGE_HEIGHT - MARGIN * 2,
		);

		if (!layout || !fitsPages) {
			for (const cells of rows) {
				for (const [column, pieces] of cells.entries()) {
					await drawPiecesWrapped(
						[
							...header[column],
							{ text: ": ", fonts: fonts.bold, size },
							...pieces,
						],
						cellStyle,
					);
				}
				page.drawLine({
					start: { x: MARGIN, y: y + lineHeight - 4 },
					end: { x: MARGIN + CONTENT_WIDTH, y: y + lineHeight - 4 },
					thickness: 0.5,
					color: TABLE_RULE,
				});
				y -= 6;
			}
			return;
		}

		const { widths } = layout;
		const [headLines, ...rowLines] = layout.rows;
		const [headHeight, ...rowHeights] = layout.heights;

		/** One row of cells, its top edge at `top`. */
		const drawRow = (
			cells: Piece[][][],
			top: number,
			height: number,
			fill?: Color,
		) => {
			let x = MARGIN;
			cells.forEach((lines, column) => {
				const width = widths[column] + padX * 2;
				page.drawRectangle({
					x,
					y: top - height,
					width,
					height,
					borderColor: TABLE_RULE,
					borderWidth: 0.5,
					...(fill ? { color: fill } : {}),
				});
				lines.forEach((line, index) => {
					const room = widths[column] - widthOfPieces(line);
					const align = block.align[column];
					const offset =
						align === "center" ? room / 2 : align === "right" ? room : 0;
					// Each line's text sits in the middle of its line height.
					const baseline =
						top -
						padY -
						index * lineHeight -
						(lineHeight + size) / 2 +
						size * 0.22;
					drawPieces(line, x + padX + offset, baseline, INK);
				});
				x += width;
			});
		};

		// The table's top edge sits where the top of a line of text would.
		let top = y + body.size * 0.75;
		const startPage = () => {
			newPage();
			top = y + body.size * 0.75;
		};
		const drawHead = () => {
			drawRow(headLines, top, headHeight, TABLE_HEAD_FILL);
			top -= headHeight;
		};
		// The header row stays with the first row.
		if (top - headHeight - (rowHeights[0] ?? 0) < MARGIN) startPage();
		drawHead();
		for (const [index, cells] of rowLines.entries()) {
			const height = rowHeights[index];
			if (top - height < MARGIN) {
				startPage();
				drawHead();
			}
			drawRow(cells, top, height);
			top -= height;
		}
		y = top - body.lineHeight;
	};

	/** The entry's footnotes, numbered as the text refers to them, after its text. */
	const drawNotes = async (document: MarkdownDocument, flow: Flow) => {
		const { notes } = flow;
		if (notes.labels.length === 0) return;
		await drawHeading("Notes", 12, 6);
		const style: TextStyle = {
			...body,
			size: 10,
			lineHeight: 14,
			x: MARGIN + 18,
			width: CONTENT_WIDTH - 18,
		};
		// Notes may refer to further notes, which then join the end of the list.
		for (let index = 0; index < notes.labels.length; index += 1) {
			const paragraphs = (document.notes.get(notes.labels[index]) ?? []).filter(
				Boolean,
			);
			for (const [at, text] of paragraphs.entries()) {
				await drawProse(
					parseInline(text, document),
					style,
					flow,
					at === 0 ? `${index + 1}.` : undefined,
				);
				y -= 3;
			}
		}
	};

	const drawMarkdown = async (entry: ExportEntry) => {
		const document = parseMarkdown(entry.body);
		const flow: Flow = { entry, notes: createNoteNumbers() };
		const inline = (text: string) => parseInline(text, document);
		for (const block of document.blocks) {
			if (block.type === "heading") {
				await drawHeading(
					{ nodes: inline(block.text), flow },
					block.level <= 2 ? 14 : 12,
					block.level <= 2 ? 8 : 6,
				);
			} else if (block.type === "list") {
				for (const [index, item] of block.items.entries()) {
					await drawProse(
						inline(item),
						{ ...body, x: MARGIN + 18, width: CONTENT_WIDTH - 18 },
						flow,
						block.ordered ? `${index + 1}.` : "•",
					);
					y -= 3;
				}
				y -= 3;
			} else if (block.type === "quote") {
				await drawProse(
					inline(block.text),
					{
						...body,
						fonts: fonts.italic,
						color: CALLOUT_INK,
						x: MARGIN + 14,
						width: CONTENT_WIDTH - 28,
						fill: CALLOUT_FILL,
					},
					flow,
				);
				y -= 6;
			} else if (block.type === "code") {
				await drawCode(block.text);
				y -= 6;
			} else if (block.type === "table") {
				await drawTable(block, document, flow);
				y -= 6;
			} else {
				await drawProse(inline(block.text), body, flow);
				y -= 6;
			}
		}
		await drawNotes(document, flow);
	};

	const drawEntry = async (
		entry: ExportEntry,
		depth: number,
	): Promise<OutlineNode> => {
		where = describeExportEntry(entry);
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
			await drawText(label.toUpperCase(), {
				...body,
				fonts: fonts.bold,
				size: 8,
				lineHeight: eyebrowHeight,
				color: MUTED,
			});
		}
		await drawHeading(entry.title, size, compact ? 4 : 10);
		await drawMarkdown(entry);
		y -= compact ? 6 : 14;
		const children: OutlineNode[] = [];
		for (const child of entry.children ?? []) {
			children.push(await drawEntry(child, depth + 1));
		}
		return { title: entry.title, mark, children };
	};

	// Title block.
	await drawText(bundle.title, {
		...body,
		fonts: fonts.bold,
		size: 24,
		lineHeight: 30,
		color: HEADING_INK,
	});
	if (bundle.author) {
		y -= 4;
		await drawText(bundle.author, { ...body, size: 13, lineHeight: 18 });
	}
	const edition = formatExportEdition(bundle);
	if (edition) {
		y -= 2;
		await drawText(edition, {
			...body,
			fonts: fonts.italic,
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
	for (const [index, part] of bundle.parts.entries()) {
		if (!showParts) {
			for (const entry of part.entries) outline.push(await drawEntry(entry, 1));
			continue;
		}
		where = `part "${part.title}"`;
		if (index > 0) newPage();
		const mark = here();
		await drawHeading(part.title, 22, 18);
		const children: OutlineNode[] = [];
		for (const entry of part.entries) children.push(await drawEntry(entry, 1));
		outline.push({ title: part.title, mark, children });
	}

	if (unsupported.size > 0) {
		throw unsupportedTextError(
			bundle.title,
			unsupported,
			options.pdfFonts !== undefined,
			new Set(
				[...Object.values(fonts), ...monoFonts.values()].flatMap((chain) => [
					...chain.unshaped,
				]),
			),
		);
	}

	const { standard } = fonts.regular;
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
		await drawHeading("Contents", headingSize, headingGap);
		for (const { node, depth } of rows) {
			if (y - rowHeight < MARGIN) {
				contentsPage += 1;
				page = pdfDoc.getPage(contentsPage);
				y = PAGE_HEIGHT - MARGIN;
			}
			const rowFonts = showParts && depth === 0 ? fonts.bold : fonts.regular;
			const x = MARGIN + depth * 14;
			const pageLabel = String(node.mark.pageIndex + 1);
			const labelWidth = standard.widthOfTextAtSize(pageLabel, 11);
			const maxWidth = PAGE_WIDTH - MARGIN - x - labelWidth - 12;
			let title = encodePdfText(node.title, rowFonts.covers);
			await rowFonts.prepare(title);
			while (
				Array.from(title).length > 1 &&
				widthOfText(title, rowFonts, 11) > maxWidth
			) {
				title = `${Array.from(title).slice(0, -2).join("")}…`;
			}
			drawLine(title, x, { fonts: rowFonts, size: 11, color: INK });
			page.drawText(pageLabel, {
				x: PAGE_WIDTH - MARGIN - labelWidth,
				y,
				size: 11,
				font: standard,
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
			x: (PAGE_WIDTH - standard.widthOfTextAtSize(label, 9)) / 2,
			y: MARGIN / 2,
			size: 9,
			font: standard,
			color: MUTED,
		});
	});

	return pdfDoc.save();
};
