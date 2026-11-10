import {
	type PDFDocument,
	PDFHexString,
	PDFName,
	type PDFObject,
	type PDFRef,
} from "pdf-lib";
import type { ExportEntry } from "./types";

/**
 * What a reader moves around the PDF by, as PDF objects: the outline
 * (bookmarks), and the strings that name destinations and link addresses.
 */

/** Where an outline entry or contents line points: a page and the top of its heading. */
export type Mark = { pageIndex: number; top: number };

/** A name as a PDF string, written the same way in the name tree and in each link: ASCII as is, else UTF-16 with a byte-order mark. */
export const pdfNameString = (name: string): PDFHexString => {
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
export const pdfUriString = (uri: string): PDFHexString =>
	pdfNameString(
		uri.replace(/[^\x21-\x7e]/gu, (char) => encodeURIComponent(char)),
	);
export type OutlineNode = {
	title: string;
	mark: Mark;
	children: OutlineNode[];
};

export const flattenOutline = (
	nodes: OutlineNode[],
	depth = 0,
): Array<{ node: OutlineNode; depth: number }> =>
	nodes.flatMap((node) => [
		{ node, depth },
		...flattenOutline(node.children, depth + 1),
	]);

export const countEntries = (entries: ExportEntry[]): number =>
	entries.reduce(
		(total, entry) => total + 1 + countEntries(entry.children ?? []),
		0,
	);

/** The document outline (bookmarks), opened by default so the reader sees the book's structure. */
export const addOutline = (pdfDoc: PDFDocument, nodes: OutlineNode[]) => {
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
