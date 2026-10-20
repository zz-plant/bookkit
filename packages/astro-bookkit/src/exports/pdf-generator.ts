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
import { stripMarkdown } from "../utils/markdown";
import { defaultImageLoader, imageWarning, warnWith } from "./images";
import {
	type InlineImage,
	parseMarkdownBlocks,
	splitImages,
} from "./markdown-blocks";
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
	widthOfText,
} from "./pdf-fonts";
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

/** Lines no wider than `maxWidth`; a word longer than a line (a URL, an identifier) is split. */
const wrapText = (
	text: string,
	fonts: PdfFontChain,
	size: number,
	maxWidth: number,
): string[] => {
	const fits = (value: string) => widthOfText(value, fonts, size) <= maxWidth;
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
			const chars = Array.from(current);
			let cut = chars.length - 1;
			while (cut > 1 && !fits(chars.slice(0, cut).join(""))) cut -= 1;
			lines.push(chars.slice(0, cut).join(""));
			current = chars.slice(cut).join("");
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

	/** One line of text, each run in the font that has its characters. */
	const drawLine = (
		line: string,
		x: number,
		style: Pick<TextStyle, "fonts" | "size" | "color">,
	) => {
		let at = x;
		for (const run of fontRuns(line, style.fonts)) {
			page.drawText(run.text, {
				x: at,
				y,
				size: style.size,
				font: run.font,
				color: style.color,
			});
			at += run.font.widthOfTextAtSize(run.text, style.size);
		}
	};

	/** Wrapped text, breaking to a new page between any two lines. */
	const drawText = async (text: string, style: TextStyle, marker?: string) => {
		const encoded = encode(text, style.fonts);
		await style.fonts.prepare(encoded);
		const lines = wrapText(encoded, style.fonts, style.size, style.width);
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
					font: style.fonts.standard,
					color: style.color,
				});
			}
			drawLine(line, style.x, style);
			y -= style.lineHeight;
		});
	};

	const drawHeading = async (
		text: string,
		size: number,
		spaceBelow: number,
	) => {
		const lineHeight = size * 1.3;
		// Keep a heading on the same page as the line after it.
		ensureSpace(lineHeight + spaceBelow + body.lineHeight);
		await drawText(stripMarkdown(text), {
			...body,
			fonts: fonts.bold,
			size,
			lineHeight,
			color: HEADING_INK,
		});
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
		text: string,
		style: TextStyle,
		entry: ExportEntry,
		marker?: string,
	) => {
		let pending = "";
		let lead = marker;
		const flush = async () => {
			if (pending.trim()) await drawText(stripMarkdown(pending), style, lead);
			pending = "";
			lead = undefined;
		};
		const parts = splitImages(text);
		if (parts.length === 1 && typeof parts[0] === "string") {
			await drawText(stripMarkdown(parts[0]), style, marker);
			return;
		}
		for (const part of parts) {
			if (typeof part === "string") {
				pending += part;
				continue;
			}
			const pdfImage = await embedImage(part, entry);
			if (pdfImage) {
				await flush();
				drawImage(pdfImage, style);
			} else if (part.alt.trim()) {
				pending += ` ${imageAltText(part)} `;
			}
		}
		await flush();
	};

	const drawMarkdown = async (entry: ExportEntry) => {
		for (const block of parseMarkdownBlocks(entry.body)) {
			if (block.type === "heading") {
				await drawHeading(
					block.text,
					block.level <= 2 ? 14 : 12,
					block.level <= 2 ? 8 : 6,
				);
			} else if (block.type === "list") {
				for (const [index, item] of block.items.entries()) {
					await drawProse(
						item,
						{ ...body, x: MARGIN + 18, width: CONTENT_WIDTH - 18 },
						entry,
						block.ordered ? `${index + 1}.` : "•",
					);
					y -= 3;
				}
				y -= 3;
			} else if (block.type === "quote") {
				await drawProse(
					block.text,
					{
						...body,
						fonts: fonts.italic,
						color: CALLOUT_INK,
						x: MARGIN + 14,
						width: CONTENT_WIDTH - 28,
						fill: CALLOUT_FILL,
					},
					entry,
				);
				y -= 6;
			} else {
				await drawProse(block.text, body, entry);
				y -= 6;
			}
		}
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
			new Set(Object.values(fonts).flatMap((chain) => [...chain.unshaped])),
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
