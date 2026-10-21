import {
	type Color,
	LineCapStyle,
	PDFDocument,
	PDFHexString,
	type PDFImage,
	PDFName,
	type PDFObject,
	type PDFPage,
	type PDFRef,
	rgb,
} from "pdf-lib";
import { HAS_SCHEME, isSafeLink } from "../utils/links";
import type {
	InlineImage,
	MarkdownBlock,
	MarkdownDocument,
} from "../utils/markdown-blocks";
import {
	type HeadingBlock,
	parseEntryMarkdown,
} from "../utils/markdown-headings";
import {
	createNoteNumbers,
	type InlineNode,
	type NoteNumbers,
	parseInline,
} from "../utils/markdown-inline";
import { defaultImageLoader, imageWarning, warnWith } from "./images";
import {
	imageAltText,
	readLinkTarget,
	readSectionOf,
} from "./markdown-to-html";
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
	type PdfLinkTarget,
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
const LINK_INK = rgb(0.1, 0.3, 0.65);
// A list's bullet at each depth, alternating.
const BULLETS = ["•", "–"];
// How far a task's text sits right of its box's left edge.
const TASK_INDENT = 13;
// Table text, cell padding, and the narrowest column worth drawing as a grid.
const TABLE = { size: 10, lineHeight: 13, padX: 5, padY: 4, minColumn: 36 };

/**
 * What leads a list item's first line: its bullet or number, and for a task
 * list item, after that, a box drawn ticked or empty.
 */
type Marker = string | { bullet: string; checked: boolean };

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

/** Where on the page blocks are drawn, and the text style they start from. */
type Frame = {
	x: number;
	width: number;
	/** How many lists the blocks sit in, for each list's bullet. */
	lists: number;
	text?: Pick<TextStyle, "fonts" | "color" | "fill">;
};

/** Bold, italic, and code, each on or off: which of the eight faces text is drawn in. */
type Face = { bold: boolean; italic: boolean; mono: boolean };

// Keyed by "m" (code), "b" (bold), and "i" (italic), in that order.
const FACE_STYLES: Readonly<Record<string, PdfFontStyle>> = {
	"": "regular",
	b: "bold",
	i: "italic",
	bi: "boldItalic",
	m: "mono",
	mb: "monoBold",
	mi: "monoItalic",
	mbi: "monoBoldItalic",
};
const faceStyle = ({ bold, italic, mono }: Face): PdfFontStyle =>
	FACE_STYLES[`${mono ? "m" : ""}${bold ? "b" : ""}${italic ? "i" : ""}`];

const BOLD_ELEMENTS = new Set(["b", "strong"]);
const ITALIC_ELEMENTS = new Set(["i", "em", "cite", "dfn", "var"]);
const MONO_ELEMENTS = new Set(["code", "kbd", "samp"]);

/** A name as a PDF string, written the same way in the name tree and in each link: ASCII as is, else UTF-16 with a byte-order mark. */
const pdfNameString = (name: string): PDFHexString => {
	const bytes = /^[\x20-\x7e]*$/.test(name)
		? Array.from(name, (char) => char.charCodeAt(0))
		: [
				0xfe,
				0xff,
				...Array.from({ length: name.length }, (_, index) => {
					const unit = name.charCodeAt(index);
					return [unit >> 8, unit & 0xff];
				}).flat(),
			];
	return PDFHexString.of(
		bytes.map((byte) => byte.toString(16).padStart(2, "0")).join(""),
	);
};

/** A URI as the PDF stores it: 7-bit ASCII, anything else percent-encoded. */
const pdfUriString = (uri: string): PDFHexString =>
	pdfNameString(
		uri.replace(/[^\x21-\x7e]/gu, (char) => encodeURIComponent(char)),
	);
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
	const siteUrl = bundle.siteUrl?.trim().replace(/\/+$/, "");

	const bookFonts: () => PdfFontFile[] = once(options.pdfFonts ?? (() => []));
	// Each face's fonts, embedded the first time text needs them, so a PDF with
	// no code (or no bold italic) embeds no Courier (or Helvetica Bold Oblique).
	const chains = new Map<PdfFontStyle, PdfFontChain>();
	const faces = new Map<PdfFontChain, Face>();
	const fontsFor = async (face: Face): Promise<PdfFontChain> => {
		const style = faceStyle(face);
		let chain = chains.get(style);
		if (!chain) {
			chain = await createPdfFontChain(pdfDoc, style, bookFonts);
			chains.set(style, chain);
			faces.set(chain, face);
		}
		return chain;
	};
	const fonts = {
		regular: await fontsFor({ bold: false, italic: false, mono: false }),
		bold: await fontsFor({ bold: true, italic: false, mono: false }),
		italic: await fontsFor({ bold: false, italic: true, mono: false }),
	};
	const body: TextStyle = {
		fonts: fonts.regular,
		size: 11,
		lineHeight: 16,
		color: INK,
		x: MARGIN,
		width: CONTENT_WIDTH,
	};
	const page0: Frame = { x: MARGIN, width: CONTENT_WIDTH, lists: 0 };

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

	// Named destinations (each entry, and each heading by the id the site gives
	// it), and the linked areas of text, made into link annotations at the end.
	const destinations = new Map<string, { page: PDFPage; top: number }>();
	const name = (destination: string, top: number) => {
		if (!destinations.has(destination)) {
			destinations.set(destination, { page, top: Math.min(PAGE_HEIGHT, top) });
		}
	};
	const linked: Array<{
		page: PDFPage;
		rect: [number, number, number, number];
		link: PdfLinkTarget;
	}> = [];

	/** One line of pieces from `x` on `baseline`, each run in the font that has its characters. */
	const drawPieces = (
		line: Piece[],
		x: number,
		baseline: number,
		color: Color,
	) => {
		let at = x;
		for (const piece of line) {
			const start = at;
			for (const run of fontRuns(piece.text, piece.fonts)) {
				page.drawText(run.text, {
					x: at,
					y: baseline + (piece.rise ?? 0),
					size: piece.size,
					font: run.font,
					color: piece.color ?? color,
				});
				at += run.font.widthOfTextAtSize(run.text, piece.size);
			}
			if (!piece.link || at === start) continue;
			const bottom = baseline + (piece.rise ?? 0) - piece.size * 0.25;
			const top = baseline + (piece.rise ?? 0) + piece.size * 0.9;
			const last = linked[linked.length - 1];
			// Linked text that runs on in another face is one area.
			if (
				last?.link === piece.link &&
				last.page === page &&
				Math.abs(last.rect[2] - start) < 0.01 &&
				last.rect[1] <= baseline &&
				last.rect[3] >= baseline
			) {
				last.rect[1] = Math.min(last.rect[1], bottom);
				last.rect[2] = at;
				last.rect[3] = Math.max(last.rect[3], top);
			} else {
				linked.push({ page, rect: [start, bottom, at, top], link: piece.link });
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

	/**
	 * A task's box, ☐ or ☑, at `x` on the current line, drawn as lines: none
	 * of the built-in fonts has those characters.
	 */
	const drawTaskBox = (checked: boolean, x: number, style: TextStyle) => {
		const side = style.size * 0.72;
		page.drawRectangle({
			x,
			y,
			width: side,
			height: side,
			borderColor: style.color,
			borderWidth: 0.8,
		});
		if (!checked) return;
		const at = (dx: number, dy: number) => ({
			x: x + side * dx,
			y: y + side * dy,
		});
		const tick = {
			thickness: 1.2,
			color: style.color,
			lineCap: LineCapStyle.Round,
		};
		page.drawLine({ start: at(0.2, 0.5), end: at(0.42, 0.24), ...tick });
		page.drawLine({ start: at(0.42, 0.24), end: at(0.82, 0.8), ...tick });
	};

	/** The list marker (a bullet or number) to the left of a line of text, then a task's box. */
	const drawMarker = (marker: Marker, style: TextStyle) => {
		const { bullet, checked } =
			typeof marker === "string"
				? { bullet: marker, checked: undefined }
				: marker;
		const boxX = style.x - (checked === undefined ? 0 : TASK_INDENT);
		page.drawText(bullet, {
			x: boxX - 16,
			y,
			size: style.size,
			font: style.fonts.standard,
			color: style.color,
		});
		if (checked !== undefined) drawTaskBox(checked, boxX, style);
	};

	/** Wrapped text in mixed fonts, breaking to a new page between any two lines. */
	const drawPiecesWrapped = async (
		pieces: Piece[],
		style: TextStyle,
		marker?: Marker,
	) => {
		const lines = wrapWords(toWords(await preparePieces(pieces)), style.width);
		lines.forEach((line, index) => {
			ensureSpace(style.lineHeight);
			drawFill(style);
			if (index === 0 && marker) drawMarker(marker, style);
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

	/** The entry's named destination: its page's path on the site, `chapters/<slug>`. */
	const entryDestination = (entry: ExportEntry) =>
		`${readSectionOf(entry.kind)}/${entry.slug}`;

	/**
	 * Where a link in `entry` points: a heading or entry in this PDF (a named
	 * destination), else the page on the site, else nowhere (null). A link
	 * with a scheme exports do not open (`javascript:`, `data:`) stays text.
	 */
	const linkTarget = (
		href: string,
		entry: ExportEntry,
	): PdfLinkTarget | null => {
		if (!isSafeLink(href)) return null;
		if (href.startsWith("#")) {
			const fallback = entryDestination(entry);
			return { destination: `${fallback}/${href.slice(1)}`, fallback };
		}
		if (HAS_SCHEME.test(href)) return { uri: href };
		const uri =
			href.startsWith("/") && siteUrl ? `${siteUrl}${href}` : undefined;
		const record = readLinkTarget(href);
		if (record) {
			const fallback = `${readSectionOf(record.kind)}/${record.slug}`;
			const destination = record.fragment
				? `${fallback}/${record.fragment}`
				: fallback;
			return { destination, fallback, ...(uri ? { uri } : {}) };
		}
		return uri ? { uri } : null;
	};

	/**
	 * Inline Markdown as pieces in `style`: bold, italic, and both in their
	 * faces, code (and `<kbd>`, `<samp>`) in Courier, `<sup>`, `<sub>`, and a
	 * footnote reference raised or lowered, `<q>` in quotation marks, `<br>`
	 * as a line break, and links in the link colour, clickable. Other HTML
	 * keeps its words. Images come back as they are.
	 */
	const flowPieces = async (
		nodes: InlineNode[],
		style: TextStyle,
		flow: Flow,
	): Promise<Array<Piece | InlineImage>> => {
		const out: Array<Piece | InlineImage> = [];
		type State = {
			face: Face;
			scale: number;
			rise: number;
			link?: PdfLinkTarget;
		};
		const piece = async (text: string, state: State): Promise<Piece> => ({
			text,
			fonts: await fontsFor(state.face),
			size: style.size * state.scale,
			...(state.rise ? { rise: state.rise } : {}),
			...(state.link ? { link: state.link, color: LINK_INK } : {}),
		});
		const walk = async (list: InlineNode[], state: State) => {
			const { face } = state;
			for (const node of list) {
				if (node.type === "text") {
					out.push(await piece(node.text, state));
				} else if (node.type === "code") {
					out.push(
						await piece(node.text, { ...state, face: { ...face, mono: true } }),
					);
				} else if (node.type === "break") {
					out.push({ ...(await piece("", state)), lineBreak: true });
				} else if (node.type === "noteref") {
					out.push({
						text: String(flow.notes.refer(node.label).number),
						fonts: await fontsFor(face),
						size: style.size * 0.65,
						rise: style.size * 0.35,
					});
				} else if (node.type === "image") {
					out.push(node.image);
				} else if (node.type === "strong") {
					await walk(node.children, {
						...state,
						face: { ...face, bold: true },
					});
				} else if (node.type === "em") {
					await walk(node.children, {
						...state,
						face: { ...face, italic: true },
					});
				} else if (node.type === "link") {
					const link = linkTarget(node.href, flow.entry) ?? state.link;
					await walk(node.children, { ...state, link });
				} else if (node.type === "element") {
					const { name } = node;
					const next: State = {
						...state,
						face: {
							bold: face.bold || BOLD_ELEMENTS.has(name),
							italic: face.italic || ITALIC_ELEMENTS.has(name),
							mono: face.mono || MONO_ELEMENTS.has(name),
						},
					};
					if (name === "sup" || name === "sub") {
						next.scale = state.scale * 0.7;
						next.rise =
							state.rise +
							style.size * state.scale * (name === "sup" ? 0.33 : -0.15);
					}
					if (name === "q") out.push(await piece("“", state));
					await walk(node.children, next);
					if (name === "q") out.push(await piece("”", state));
				} else {
					await walk(node.children, state);
				}
			}
		};
		await walk(nodes, {
			face: faces.get(style.fonts) ?? {
				bold: false,
				italic: false,
				mono: false,
			},
			scale: 1,
			rise: 0,
		});
		return out;
	};

	const drawHeading = async (
		content: string | { nodes: InlineNode[]; flow: Flow },
		size: number,
		spaceBelow: number,
		frame: Frame = page0,
		destination?: string,
	) => {
		const lineHeight = size * 1.3;
		// Keep a heading on the same page as the line after it.
		ensureSpace(lineHeight + spaceBelow + body.lineHeight);
		if (destination) name(destination, y + size);
		const style: TextStyle = {
			...body,
			fonts: fonts.bold,
			size,
			lineHeight,
			color: HEADING_INK,
			x: frame.x,
			width: frame.width,
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
		marker?: Marker,
	) => {
		let pending: Piece[] = [];
		let lead = marker;
		const flush = async () => {
			if (pending.some((piece) => piece.text.trim())) {
				await drawPiecesWrapped(pending, style, lead);
				lead = undefined;
			}
			pending = [];
		};
		for (const part of await flowPieces(nodes, style, flow)) {
			if (!("src" in part)) {
				pending.push(part);
				continue;
			}
			const pdfImage = await embedImage(part, flow.entry);
			if (pdfImage) {
				await flush();
				if (lead) {
					ensureSpace(style.lineHeight);
					drawMarker(lead, style);
					lead = undefined;
				}
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
	const drawCode = async (code: string, frame: Frame) => {
		const style: TextStyle = {
			...body,
			fonts: await fontsFor({ bold: false, italic: false, mono: true }),
			size: 9.5,
			lineHeight: 13,
			x: frame.x + 8,
			width: frame.width - 16,
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
		frame: Frame,
	) => {
		const { size, lineHeight, padX, padY } = TABLE;
		const cellStyle: TextStyle = {
			...body,
			size,
			lineHeight,
			x: frame.x,
			width: frame.width,
		};
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
		if (block.caption) {
			await drawProse(
				parseInline(block.caption, document),
				{
					...body,
					x: frame.x,
					width: frame.width,
					fonts: fonts.italic,
					color: MUTED,
				},
				flow,
			);
			y -= 2;
		}
		// In reading order, so footnote references are numbered as they are read.
		const header: Piece[][] | null = block.header ? [] : null;
		for (const cell of block.header ?? []) {
			header?.push(await cellPieces(cell, headStyle));
		}
		const rows: Piece[][][] = [];
		for (const row of block.rows) {
			const cells: Piece[][] = [];
			for (const cell of row) cells.push(await cellPieces(cell, cellStyle));
			rows.push(cells);
		}
		const columns = block.align.length;
		const laidOut = header ? [header, ...rows] : rows;
		const layout =
			laidOut.length > 0
				? layoutTable(laidOut, frame.width - padX * 2 * columns, TABLE)
				: null;
		const headHeight = header ? (layout?.heights[0] ?? 0) : 0;
		const fitsPages = layout?.heights.every(
			(height) => headHeight + height <= PAGE_HEIGHT - MARGIN * 2,
		);

		if (!layout || !fitsPages) {
			for (const cells of rows) {
				for (const [column, pieces] of cells.entries()) {
					await drawPiecesWrapped(
						header
							? [
									...header[column],
									{ text: ": ", fonts: fonts.bold, size },
									...pieces,
								]
							: pieces,
						cellStyle,
					);
				}
				page.drawLine({
					start: { x: frame.x, y: y + lineHeight - 4 },
					end: { x: frame.x + frame.width, y: y + lineHeight - 4 },
					thickness: 0.5,
					color: TABLE_RULE,
				});
				y -= 6;
			}
			return;
		}

		const { widths } = layout;
		const headLines = header ? layout.rows[0] : null;
		const rowLines = header ? layout.rows.slice(1) : layout.rows;
		const rowHeights = header ? layout.heights.slice(1) : layout.heights;

		/** One row of cells, its top edge at `top`. */
		const drawRow = (
			cells: Piece[][][],
			top: number,
			height: number,
			fill?: Color,
		) => {
			let x = frame.x;
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
			if (!headLines) return;
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

	/** Blocks in `frame`; list items, descriptions, and quotes draw theirs indented. */
	const drawBlocks = async (
		blocks: MarkdownBlock[],
		frame: Frame,
		document: MarkdownDocument,
		flow: Flow,
		ids: ReadonlyMap<HeadingBlock, string>,
	): Promise<void> => {
		const inline = (text: string) => parseInline(text, document);
		const style: TextStyle = {
			...body,
			...frame.text,
			x: frame.x,
			width: frame.width,
		};
		const indented = (by: number, extra: Partial<Frame> = {}): Frame => ({
			...frame,
			x: frame.x + by,
			width: frame.width - by,
			...extra,
		});
		const nested = (inner: MarkdownBlock[], at: Frame) =>
			drawBlocks(inner, at, document, flow, ids);
		for (const block of blocks) {
			if (block.type === "heading") {
				const nodes = inline(block.text);
				// A heading written as an HTML tag has no id on the site, so none here.
				const id = ids.get(block);
				const destination =
					id === undefined
						? undefined
						: `${entryDestination(flow.entry)}/${id}`;
				await drawHeading(
					{ nodes, flow },
					block.level <= 2 ? 14 : 12,
					block.level <= 2 ? 8 : 6,
					frame,
					destination,
				);
			} else if (block.type === "list") {
				const item = indented(18, { lists: frame.lists + 1 });
				for (const [index, entry] of block.items.entries()) {
					const bullet = block.ordered
						? `${block.start + index}.`
						: BULLETS[frame.lists % BULLETS.length];
					const { checked } = entry;
					const marker: Marker =
						checked === undefined ? bullet : { bullet, checked };
					// A task's text lines up after its box, line after line.
					const taskIndent = checked === undefined ? 0 : TASK_INDENT;
					const itemStyle = {
						...style,
						x: item.x + taskIndent,
						width: item.width - taskIndent,
					};
					if (entry.text.trim()) {
						await drawProse(inline(entry.text), itemStyle, flow, marker);
					} else {
						ensureSpace(itemStyle.lineHeight);
						drawMarker(marker, itemStyle);
					}
					y -= 3;
					await nested(entry.blocks, item);
				}
				if (frame.lists === 0) y -= 3;
			} else if (block.type === "quote") {
				await drawProse(
					inline(block.text),
					{
						...style,
						fonts: fonts.italic,
						color: CALLOUT_INK,
						x: frame.x + 14,
						width: frame.width - 28,
						fill: CALLOUT_FILL,
					},
					flow,
				);
				y -= 6;
			} else if (block.type === "code") {
				await drawCode(block.text, frame);
				y -= 6;
			} else if (block.type === "table") {
				await drawTable(block, document, flow, frame);
				y -= 6;
			} else if (block.type === "rule") {
				ensureSpace(body.lineHeight);
				const ruleY = y + body.lineHeight * 0.4;
				page.drawLine({
					start: { x: frame.x, y: ruleY },
					end: { x: frame.x + frame.width, y: ruleY },
					thickness: 0.5,
					color: TABLE_RULE,
				});
				y -= body.lineHeight * 0.6;
			} else if (block.type === "details") {
				// The summary leads in bold, and the content always follows it.
				if (block.summary) {
					await drawProse(
						inline(block.summary),
						{ ...style, fonts: fonts.bold },
						flow,
					);
					y -= 4;
				}
				await nested(block.blocks, frame);
			} else if (block.type === "definitions") {
				for (const item of block.items) {
					if ("term" in item) {
						await drawProse(
							inline(item.term),
							{ ...style, fonts: fonts.bold },
							flow,
						);
						y -= 2;
					} else {
						await nested(item.blocks, indented(18));
					}
				}
			} else if (block.type === "section") {
				await nested(
					block.blocks,
					block.tag === "blockquote"
						? {
								...frame,
								x: frame.x + 14,
								width: frame.width - 28,
								text: {
									fonts: fonts.italic,
									color: CALLOUT_INK,
									fill: CALLOUT_FILL,
								},
							}
						: frame,
				);
			} else if (block.type === "caption") {
				await drawProse(
					inline(block.text),
					{
						...style,
						fonts: fonts.italic,
						color: MUTED,
						size: 10,
						lineHeight: 14,
					},
					flow,
				);
				y -= 6;
			} else {
				await drawProse(inline(block.text), style, flow);
				y -= 6;
			}
		}
	};

	const drawMarkdown = async (entry: ExportEntry) => {
		const { document, ids } = parseEntryMarkdown({
			...entry.fields,
			body: entry.body,
		});
		const flow: Flow = { entry, notes: createNoteNumbers() };
		await drawBlocks(document.blocks, page0, document, flow, ids);
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
		name(entryDestination(entry), mark.top);
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
			new Set([...chains.values()].flatMap((chain) => [...chain.unshaped])),
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

	// Named destinations, in the order PDF name trees require (by their bytes).
	const { context } = pdfDoc;
	const names = [...destinations]
		.map(([key, target]) => ({ string: pdfNameString(key), target }))
		.sort((a, b) => (a.string.asString() < b.string.asString() ? -1 : 1));
	if (names.length > 0) {
		const pairs = names.flatMap(({ string, target }) => [
			string,
			context.obj([target.page.ref, "XYZ", null, target.top, null]),
		]);
		pdfDoc.catalog.set(
			PDFName.of("Names"),
			context.obj({ Dests: context.register(context.obj({ Names: pairs })) }),
		);
	}
	// Links in the text: to a destination this PDF has (the heading, else its
	// entry), else to the site, else none.
	for (const area of linked) {
		const { link } = area;
		let action: Record<string, PDFObject | string> | null = null;
		if ("destination" in link) {
			const target = [link.destination, link.fallback].find((key) =>
				destinations.has(key),
			);
			if (target) action = { S: "GoTo", D: pdfNameString(target) };
			else if (link.uri) action = { S: "URI", URI: pdfUriString(link.uri) };
		} else {
			action = { S: "URI", URI: pdfUriString(link.uri) };
		}
		if (!action) continue;
		area.page.node.addAnnot(
			context.register(
				context.obj({
					Type: "Annot",
					Subtype: "Link",
					Rect: area.rect,
					Border: [0, 0, 0],
					A: context.obj(action),
				}),
			),
		);
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
