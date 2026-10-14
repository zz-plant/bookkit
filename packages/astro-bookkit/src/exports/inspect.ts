import JSZip from "jszip";
import {
	decodePDFRawStream,
	PDFArray,
	PDFDocument,
	type PDFObject,
	PDFRawStream,
} from "pdf-lib";

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

/**
 * What stops an EPUB from opening reliably: the OCF container, the package
 * metadata EPUB 3 requires, a manifest item or link with no file behind it,
 * or a content document that is not well-formed XHTML.
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
		for (const [, href] of xhtml.matchAll(/\shref="([^"]+)"/g)) {
			if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#")) continue;
			const target = resolvePath(path, href);
			if (!zip.file(target))
				problems.push(`${path} links to ${href}, which is not in the book`);
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

/** One text run drawn on a page, at its baseline position. */
export type PdfTextRun = { x: number; y: number; text: string };

/**
 * The text runs on each page of a PDF Bookkit wrote (single-byte WinAnsi
 * strings positioned with `Tm`, as pdf-lib draws them).
 */
export const extractPdfText = async (
	bytes: Uint8Array,
): Promise<PdfTextRun[][]> => {
	const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
	const decoder = new TextDecoder("windows-1252");
	return pdf.getPages().map((page) => {
		const runs: PdfTextRun[] = [];
		let x = 0;
		let y = 0;
		for (const stream of contentStreams(pdf, page.node.Contents())) {
			const operators = new TextDecoder("latin1").decode(
				decodePDFRawStream(stream).decode(),
			);
			for (const match of operators.matchAll(
				/(-?[\d.]+)\s+(-?[\d.]+)\s+Tm|<([\dA-Fa-f]*)>\s*Tj/g,
			)) {
				if (match[3] === undefined) {
					x = Number(match[1]);
					y = Number(match[2]);
					continue;
				}
				const hex = match[3].match(/../g) ?? [];
				const text = decoder.decode(
					new Uint8Array(hex.map((pair) => Number.parseInt(pair, 16))),
				);
				runs.push({ x, y, text });
			}
		}
		return runs;
	});
};

/** What makes a PDF unusable: it does not load, has no pages or no text, or draws text off the page. */
export const inspectPdf = async (bytes: Uint8Array): Promise<string[]> => {
	let pages: PdfTextRun[][];
	let sizes: Array<{ width: number; height: number }>;
	try {
		pages = await extractPdfText(bytes);
		const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
		sizes = pdf.getPages().map((page) => page.getSize());
	} catch (error) {
		return [`not a readable PDF: ${String(error)}`];
	}
	if (pages.length === 0) return ["the PDF has no pages"];
	const problems: string[] = [];
	if (pages.every((runs) => runs.every((run) => !run.text.trim()))) {
		problems.push("the PDF has no extractable text");
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
