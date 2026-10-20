import JSZip from "jszip";
import {
	decodePDFRawStream,
	PDFArray,
	PDFDict,
	PDFDocument,
	PDFHexString,
	PDFName,
	type PDFObject,
	type PDFPage,
	PDFRawStream,
	PDFString,
} from "pdf-lib";
import { decodeEntities } from "../utils/character-references";
import { isSafeLink, SAFE_SCHEME_LIST } from "../utils/links";

/**
 * Structural checks for built exports, deeper than "the file starts with the
 * right bytes": each function returns what is wrong, or nothing. They read
 * the files Bookkit writes; they are not general-purpose validators.
 */

const NAME = "[A-Za-z_][\\w.:-]*";
const START_TAG = new RegExp(`<(${NAME})`, "y");
const END_TAG = new RegExp(`</(${NAME})\\s*>`, "y");
const ATTRIBUTE = new RegExp(
	`\\s+(${NAME})\\s*=\\s*(?:"([^"<]*)"|'([^'<]*)')`,
	"y",
);
const TAG_CLOSE = /\s*(\/?)>/y;
const REFERENCE = /&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/y;

/** Why a document is not well-formed XML (mis-nested or unclosed tags, bare `&` or `<`), or nothing. */
export const xmlWellFormednessProblems = (xml: string): string[] => {
	const problems: string[] = [];
	const open: string[] = [];
	let roots = 0;
	const fail = (message: string, index: number) =>
		problems.push(`line ${xml.slice(0, index).split("\n").length}: ${message}`);
	const checkReferences = (text: string, offset: number) => {
		for (
			let at = text.indexOf("&");
			at !== -1;
			at = text.indexOf("&", at + 1)
		) {
			REFERENCE.lastIndex = at;
			if (!REFERENCE.test(text)) {
				fail('"&" that does not start an entity reference', offset + at);
			}
		}
	};
	const skipTo = (from: number, terminator: string, what: string) => {
		const end = xml.indexOf(terminator, from);
		if (end === -1) fail(`unclosed ${what}`, from);
		return end === -1 ? xml.length : end + terminator.length;
	};

	let index = 0;
	while (index < xml.length && problems.length === 0) {
		const lt = xml.indexOf("<", index);
		const text = xml.slice(index, lt === -1 ? xml.length : lt);
		checkReferences(text, index);
		if (open.length === 0 && text.trim()) {
			fail("text outside the root element", index);
		}
		if (lt === -1) break;
		if (xml.startsWith("<?", lt)) {
			index = skipTo(lt, "?>", "processing instruction");
		} else if (xml.startsWith("<!--", lt)) {
			index = skipTo(lt, "-->", "comment");
		} else if (xml.startsWith("<![CDATA[", lt)) {
			index = skipTo(lt, "]]>", "CDATA section");
		} else if (xml.startsWith("<!DOCTYPE", lt)) {
			index = skipTo(lt, ">", "DOCTYPE");
		} else {
			END_TAG.lastIndex = lt;
			const endTag = END_TAG.exec(xml);
			if (endTag) {
				const expected = open.pop();
				if (expected !== endTag[1]) {
					fail(`</${endTag[1]}> closes <${expected ?? "nothing"}>`, lt);
				}
				index = END_TAG.lastIndex;
				continue;
			}
			START_TAG.lastIndex = lt;
			const startTag = START_TAG.exec(xml);
			if (!startTag) {
				fail('"<" that does not start a tag', lt);
				break;
			}
			let at = START_TAG.lastIndex;
			for (;;) {
				ATTRIBUTE.lastIndex = at;
				const attribute = ATTRIBUTE.exec(xml);
				if (!attribute) break;
				checkReferences(attribute[2] ?? attribute[3] ?? "", at);
				at = ATTRIBUTE.lastIndex;
			}
			TAG_CLOSE.lastIndex = at;
			const close = TAG_CLOSE.exec(xml);
			if (!close) {
				fail(`malformed <${startTag[1]}> tag`, lt);
				break;
			}
			if (open.length === 0) roots += 1;
			if (!close[1]) open.push(startTag[1]);
			index = TAG_CLOSE.lastIndex;
		}
	}
	if (problems.length === 0 && open.length > 0) {
		fail(`<${open[open.length - 1]}> is never closed`, xml.length);
	}
	if (problems.length === 0 && roots !== 1) {
		fail(`expected one root element, found ${roots}`, 0);
	}
	return problems;
};

const attributeOf = (tag: string, name: string) =>
	tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

const resolvePath = (from: string, href: string) => {
	const parts = from.split("/").slice(0, -1);
	for (const segment of href.split("#")[0].split("/")) {
		if (segment === "..") parts.pop();
		else if (segment && segment !== ".") parts.push(segment);
	}
	return parts.join("/");
};

/** The OCF rule: `mimetype` is the first entry, stored uncompressed, with no extra field. */
const startsWithStoredMimetype = (bytes: Uint8Array): boolean => {
	if (bytes.length < 38) return false;
	const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	return (
		header.getUint32(0, true) === 0x04034b50 &&
		header.getUint16(8, true) === 0 &&
		header.getUint16(26, true) === 8 &&
		header.getUint16(28, true) === 0 &&
		new TextDecoder().decode(bytes.subarray(30, 38)) === "mimetype"
	);
};

const MODIFIED = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

const HREF = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/** What is wrong with a link whose scheme an export must not link to, or null for a safe link. */
const unsafeLinkProblem = (href: string): string | null =>
	isSafeLink(href)
		? null
		: `links to "${href.length > 60 ? `${href.slice(0, 59)}…` : href}"; an export links only to ${SAFE_SCHEME_LIST} addresses and to its own pages`;

/**
 * What stops an EPUB from opening reliably, or safely: the OCF container,
 * the package metadata EPUB 3 requires, a manifest item, link, or image with
 * no file behind it, an image the manifest does not list, a content
 * document that is not well-formed XHTML, or a link with a scheme that runs
 * code or carries a document (`javascript:`, `vbscript:`, `data:`).
 */
export const inspectEpub = async (bytes: Uint8Array): Promise<string[]> => {
	const problems: string[] = [];
	if (!startsWithStoredMimetype(bytes)) {
		problems.push(
			"the first zip entry is not an uncompressed `mimetype` file without extra fields",
		);
	}
	let zip: JSZip;
	try {
		zip = await JSZip.loadAsync(bytes);
	} catch (error) {
		return [...problems, `not a readable zip archive: ${String(error)}`];
	}
	const read = (path: string) => zip.file(path)?.async("string");

	const mimetype = await read("mimetype");
	if (mimetype !== "application/epub+zip") {
		problems.push('`mimetype` does not contain "application/epub+zip"');
	}
	const container = await read("META-INF/container.xml");
	if (container === undefined)
		return [...problems, "META-INF/container.xml is missing"];
	problems.push(
		...xmlWellFormednessProblems(container).map(
			(p) => `META-INF/container.xml ${p}`,
		),
	);
	const opfPath = container.match(/full-path="([^"]+)"/)?.[1];
	const opf = opfPath ? await read(opfPath) : undefined;
	if (!opfPath || opf === undefined) {
		return [
			...problems,
			"the package document named in container.xml is missing",
		];
	}
	problems.push(
		...xmlWellFormednessProblems(opf).map((p) => `${opfPath} ${p}`),
	);

	const uniqueId = opf.match(/unique-identifier="([^"]+)"/)?.[1];
	if (
		!uniqueId ||
		!new RegExp(`<dc:identifier[^>]*\\sid="${uniqueId}"[^>]*>[^<]+<`).test(opf)
	) {
		problems.push(`${opfPath} has no dc:identifier for its unique-identifier`);
	}
	for (const element of ["dc:title", "dc:language"]) {
		if (!new RegExp(`<${element}[^>]*>[^<]+</${element}>`).test(opf)) {
			problems.push(`${opfPath} has no ${element}`);
		}
	}
	const modified = opf.match(/<meta property="dcterms:modified">([^<]*)</)?.[1];
	if (!modified || !MODIFIED.test(modified)) {
		problems.push(
			`${opfPath} dcterms:modified is "${modified ?? ""}"; EPUB 3 requires CCYY-MM-DDThh:mm:ssZ`,
		);
	}

	const manifest = new Map<string, { path: string; type?: string }>();
	for (const [tag] of opf.matchAll(/<item\s[^>]*>/g)) {
		const id = attributeOf(tag, "id");
		const href = attributeOf(tag, "href");
		if (!id || !href) continue;
		const path = resolvePath(opfPath, href);
		manifest.set(id, { path, type: attributeOf(tag, "media-type") });
		if (!zip.file(path))
			problems.push(`manifest item "${id}" (${path}) is missing`);
	}
	for (const [, idref] of opf.matchAll(/<itemref\s[^>]*idref="([^"]+)"/g)) {
		if (!manifest.has(idref))
			problems.push(`spine item "${idref}" is not in the manifest`);
	}

	for (const { path, type } of manifest.values()) {
		if (type !== "application/xhtml+xml") continue;
		const xhtml = await read(path);
		if (xhtml === undefined) continue;
		problems.push(
			...xmlWellFormednessProblems(xhtml).map((p) => `${path} ${p}`),
		);
		for (const [, double, single] of xhtml.matchAll(HREF)) {
			const href = decodeEntities(double ?? single ?? "");
			const unsafe = unsafeLinkProblem(href);
			if (unsafe) {
				problems.push(`${path} ${unsafe}`);
				continue;
			}
			if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#"))
				continue;
			const target = resolvePath(path, href);
			if (!zip.file(target))
				problems.push(`${path} links to ${href}, which is not in the book`);
		}
		for (const [, src] of xhtml.matchAll(/\ssrc="([^"]+)"/g)) {
			if (/^[a-z][a-z0-9+.-]*:/i.test(src)) {
				problems.push(
					`${path} shows ${src} from outside the book; an EPUB carries its images`,
				);
				continue;
			}
			const target = resolvePath(path, src);
			if (!zip.file(target)) {
				problems.push(`${path} shows ${src}, which is not in the book`);
			} else if (![...manifest.values()].some((item) => item.path === target)) {
				problems.push(`${path} shows ${src}, which the manifest does not list`);
			}
		}
	}
	return problems;
};

const contentStreams = (pdf: PDFDocument, contents: PDFObject | undefined) => {
	const objects =
		contents instanceof PDFArray
			? contents.asArray().map((ref) => pdf.context.lookup(ref))
			: [contents];
	return objects.filter(
		(object): object is PDFRawStream => object instanceof PDFRawStream,
	);
};

/** One text run drawn on a page, at its baseline position, and the font it is drawn in (its BaseFont). */
export type PdfTextRun = { x: number; y: number; text: string; font: string };

const latin1 = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes);

const hexBytes = (hex: string) =>
	new Uint8Array(
		(hex.match(/../g) ?? []).map((pair) => Number.parseInt(pair, 16)),
	);

/**
 * How each of a page's fonts turns a `<hex> Tj` string into text: one
 * Windows-1252 byte per character for the standard fonts, and for an
 * embedded (Type0) font, two-byte glyph codes looked up in its ToUnicode
 * map, as pdf-lib writes it (`bfchar` entries).
 */
const pageFontDecoders = (pdf: PDFDocument, page: PDFPage) => {
	const winAnsi = new TextDecoder("windows-1252");
	const decoders = new Map<string, (hex: string) => string>();
	const baseFonts = new Map<string, string>();
	const fonts = page.node.Resources()?.lookupMaybe(PDFName.of("Font"), PDFDict);
	for (const [name, ref] of fonts?.entries() ?? []) {
		const font = pdf.context.lookup(ref);
		if (font instanceof PDFDict) {
			baseFonts.set(
				name.toString(),
				font.get(PDFName.of("BaseFont"))?.toString().slice(1) ?? "",
			);
		}
		const toUnicode =
			font instanceof PDFDict &&
			font.get(PDFName.of("Subtype"))?.toString() === "/Type0"
				? font.lookup(PDFName.of("ToUnicode"))
				: undefined;
		if (!(toUnicode instanceof PDFRawStream)) {
			decoders.set(name.toString(), (hex) => winAnsi.decode(hexBytes(hex)));
			continue;
		}
		const map = new Map<string, string>();
		const cmap = latin1(decodePDFRawStream(toUnicode).decode());
		for (const [, block] of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
			for (const [, code, unicode] of block.matchAll(
				/<([\dA-Fa-f]+)>\s*<([\dA-Fa-f]+)>/g,
			)) {
				const units = (unicode.match(/..../g) ?? []).map((unit) =>
					Number.parseInt(unit, 16),
				);
				map.set(code.toUpperCase(), String.fromCharCode(...units));
			}
		}
		decoders.set(name.toString(), (hex) =>
			(hex.toUpperCase().match(/..../g) ?? [])
				.map((code) => map.get(code) ?? "\uFFFD")
				.join(""),
		);
	}
	return { decoders, baseFonts };
};

/**
 * The text runs on each page of a PDF Bookkit wrote, as pdf-lib draws them:
 * a font set with `Tf`, a position with `Tm`, then a hex string with `Tj`.
 * Text in Helvetica and text in an embedded font are both read back.
 */
export const extractPdfText = async (
	bytes: Uint8Array,
): Promise<PdfTextRun[][]> => {
	const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
	return pdf.getPages().map((page) => {
		const { decoders, baseFonts } = pageFontDecoders(pdf, page);
		const runs: PdfTextRun[] = [];
		let decode = decoders.values().next().value ?? (() => "");
		let font = "";
		let x = 0;
		let y = 0;
		for (const stream of contentStreams(pdf, page.node.Contents())) {
			const operators = latin1(decodePDFRawStream(stream).decode());
			for (const match of operators.matchAll(
				/(\/[^\s/<>[\](){}%]+)\s+-?[\d.]+\s+Tf|(-?[\d.]+)\s+(-?[\d.]+)\s+Tm|<([\dA-Fa-f]*)>\s*Tj/g,
			)) {
				if (match[1] !== undefined) {
					decode = decoders.get(match[1]) ?? decode;
					font = baseFonts.get(match[1]) ?? font;
				} else if (match[4] === undefined) {
					x = Number(match[2]);
					y = Number(match[3]);
				} else {
					runs.push({ x, y, text: decode(match[4]), font });
				}
			}
		}
		return runs;
	});
};

/** A link on a page: where it is, and where it goes (a web address, or a named destination). */
export type PdfLink = {
	/** 1-based. */
	page: number;
	rect: number[];
	uri?: string;
	destination?: string;
};

const pdfText = (object: PDFObject | undefined) =>
	object instanceof PDFHexString || object instanceof PDFString
		? object.decodeText()
		: undefined;

/** The named destinations in a PDF's name tree (`/Names /Dests`). */
export const pdfDestinationNames = (pdf: PDFDocument): Set<string> => {
	const names = new Set<string>();
	const visit = (node: PDFObject | undefined) => {
		const dict = node instanceof PDFDict ? node : undefined;
		if (!dict) return;
		const pairs = dict.lookupMaybe(PDFName.of("Names"), PDFArray);
		for (let index = 0; pairs && index < pairs.size(); index += 2) {
			const name = pdfText(pairs.get(index));
			if (name !== undefined) names.add(name);
		}
		const kids = dict.lookupMaybe(PDFName.of("Kids"), PDFArray);
		for (let index = 0; kids && index < kids.size(); index += 1) {
			visit(kids.lookup(index));
		}
	};
	const tree = pdf.catalog.lookupMaybe(PDFName.of("Names"), PDFDict);
	visit(tree?.lookup(PDFName.of("Dests")));
	return names;
};

/** The link annotations on each page that open a web address or go to a named destination. */
export const extractPdfLinks = async (
	bytes: Uint8Array,
): Promise<PdfLink[]> => {
	const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
	return pdf.getPages().flatMap((page, index) => {
		const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
		const links: PdfLink[] = [];
		for (let at = 0; annots && at < annots.size(); at += 1) {
			const annot = annots.lookup(at);
			if (!(annot instanceof PDFDict)) continue;
			if (annot.get(PDFName.of("Subtype"))?.toString() !== "/Link") continue;
			const action = annot.lookupMaybe(PDFName.of("A"), PDFDict);
			const rect =
				annot
					.lookupMaybe(PDFName.of("Rect"), PDFArray)
					?.asArray()
					.map((value) => Number(value.toString())) ?? [];
			const uri = pdfText(action?.lookup(PDFName.of("URI")));
			const destination = pdfText(
				action?.lookup(PDFName.of("D")) ?? annot.lookup(PDFName.of("Dest")),
			);
			if (uri !== undefined || destination !== undefined) {
				links.push({
					page: index + 1,
					rect,
					...(uri !== undefined ? { uri } : {}),
					...(destination !== undefined ? { destination } : {}),
				});
			}
		}
		return links;
	});
};

/**
 * What makes a PDF unusable: it does not load, has no pages or no text,
 * draws text off the page, links to a named destination it does not have,
 * or links to an address with a scheme that runs code (`javascript:`).
 */
export const inspectPdf = async (bytes: Uint8Array): Promise<string[]> => {
	let pages: PdfTextRun[][];
	let sizes: Array<{ width: number; height: number }>;
	let destinations: Set<string>;
	try {
		pages = await extractPdfText(bytes);
		const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
		sizes = pdf.getPages().map((page) => page.getSize());
		destinations = pdfDestinationNames(pdf);
	} catch (error) {
		return [`not a readable PDF: ${String(error)}`];
	}
	if (pages.length === 0) return ["the PDF has no pages"];
	const problems: string[] = [];
	if (pages.every((runs) => runs.every((run) => !run.text.trim()))) {
		problems.push("the PDF has no extractable text");
	}
	for (const link of await extractPdfLinks(bytes)) {
		const unsafe = link.uri === undefined ? null : unsafeLinkProblem(link.uri);
		if (unsafe) problems.push(`page ${link.page} ${unsafe}`);
		if (link.destination !== undefined && !destinations.has(link.destination)) {
			problems.push(
				`page ${link.page} links to "${link.destination}", which the PDF does not have`,
			);
		}
	}
	pages.forEach((runs, index) => {
		const { width, height } = sizes[index];
		const outside = runs.filter(
			(run) => run.y < 0 || run.y > height || run.x < 0 || run.x > width,
		);
		if (outside.length > 0) {
			problems.push(
				`page ${index + 1} draws ${outside.length} line(s) of text off the page, starting "${outside[0].text.slice(0, 40)}"`,
			);
		}
	});
	return problems;
};
