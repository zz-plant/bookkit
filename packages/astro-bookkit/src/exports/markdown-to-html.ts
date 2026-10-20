import { createSlugger } from "../utils/markdown";
import {
	type InlineImage,
	type MarkdownBlock,
	parseMarkdown,
	type TableAlign,
} from "./markdown-blocks";
import {
	createNoteNumbers,
	type InlineNode,
	inlinePlainText,
	parseInline,
} from "./markdown-inline";
import type { ExportEntryKind } from "./types";

export const escapeHtml = (value: string) =>
	value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");

/** Where a link should point in the output, or null to keep only its text. */
export type LinkResolver = (href: string) => string | null;

/** A URL with a scheme (`https:`, `mailto:`), which no export rewrites. */
export const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

// Read UI sections, so a link to /read/<section>/<slug> can point inside an export.
const SECTION_KINDS: Record<string, ExportEntryKind> = {
	chapters: "chapter",
	mechanisms: "mechanism",
	toolkit: "tool",
	glossary: "glossary",
	examples: "example",
};
const READ_LINK = /^\/?read\/([a-z]+)\/([^?#]+)(?:\?[^#]*)?(?:#(.*))?$/;

/** The record a link to a read page names (`/read/chapters/x#y`), or null for any other link. */
export const readLinkTarget = (
	href: string,
): { kind: ExportEntryKind; slug: string; fragment?: string } | null => {
	const match = href.match(READ_LINK);
	const kind = match ? SECTION_KINDS[match[1]] : undefined;
	return match && kind
		? { kind, slug: match[2], fragment: match[3] || undefined }
		: null;
};

/** Where an image's file is in the output, or null to show its alt text instead. */
export type ImageResolver = (image: InlineImage) => string | null;

/**
 * An id that is a valid XML name, as EPUB content documents require: no
 * spaces or punctuation, and it starts with a letter or underscore.
 */
export const xmlId = (value: string): string => {
	const cleaned = value.normalize("NFC").replace(/[^\p{L}\p{N}_.-]/gu, "");
	if (!cleaned) return "section";
	return /^[\p{L}_]/u.test(cleaned) ? cleaned : `_${cleaned}`;
};

/** What a reader sees in place of an image the export cannot carry. */
export const imageAltText = (image: InlineImage): string =>
	`[Image: ${image.alt.trim()}]`;

/** The id of footnote `number`, and of the `count`th reference to it; slugged heading ids never hold a ".". */
const noteId = (number: number) => `fn.${number}`;
const noteRefId = (number: number, count: number) =>
	count > 1 ? `fnref.${number}.${count}` : `fnref.${number}`;

/**
 * Markdown as XHTML that is always well formed, ending with the footnotes
 * it refers to as EPUB 3 endnotes, each linking back to its references.
 */
export const markdownToHtml = (
	body: string,
	resolveLink: LinkResolver = (href) => href,
	resolveImage: ImageResolver = (image) => image.src,
): string => {
	const document = parseMarkdown(body);
	const notes = createNoteNumbers();
	const slugger = createSlugger();
	const nodesHtml = (nodes: InlineNode[]): string =>
		nodes.map(nodeHtml).join("");
	const nodeHtml = (node: InlineNode): string => {
		switch (node.type) {
			case "text":
			case "html":
				return escapeHtml(node.text);
			case "code":
				return `<code>${escapeHtml(node.text)}</code>`;
			case "strong":
			case "em":
			case "del":
				return `<${node.type}>${nodesHtml(node.children)}</${node.type}>`;
			case "link": {
				const inner = nodesHtml(node.children);
				const target = resolveLink(node.href);
				return target === null
					? inner
					: `<a href="${escapeHtml(target)}">${inner}</a>`;
			}
			case "image": {
				const { image } = node;
				const src = resolveImage(image);
				if (src !== null) {
					return `<img src="${escapeHtml(src)}" alt="${escapeHtml(image.alt)}"/>`;
				}
				return image.alt.trim()
					? `<span class="image-alt">${escapeHtml(imageAltText(image))}</span>`
					: "";
			}
			case "noteref": {
				const { number, count } = notes.refer(node.label);
				return `<sup><a id="${noteRefId(number, count)}" href="#${noteId(number)}" epub:type="noteref" role="doc-noteref">${number}</a></sup>`;
			}
		}
	};
	const inline = (text: string) => nodesHtml(parseInline(text, document));
	const cells = (tag: "th" | "td", row: string[], align: TableAlign[]) =>
		row
			.map(
				(cell, column) =>
					`<${tag}${align[column] ? ` class="align-${align[column]}"` : ""}>${inline(cell)}</${tag}>`,
			)
			.join("");

	const render = (block: MarkdownBlock): string => {
		if (block.type === "heading") {
			const level = Math.min(block.level, 6);
			const nodes = parseInline(block.text, document);
			const id = xmlId(slugger(inlinePlainText(nodes)));
			return `<h${level} id="${escapeHtml(id)}">${nodesHtml(nodes)}</h${level}>`;
		}
		if (block.type === "list") {
			const tag = block.ordered ? "ol" : "ul";
			const items = block.items.map((item) => `<li>${inline(item)}</li>`);
			return `<${tag}>${items.join("")}</${tag}>`;
		}
		if (block.type === "quote") {
			return `<blockquote><p>${inline(block.text)}</p></blockquote>`;
		}
		if (block.type === "code") {
			return `<pre><code>${escapeHtml(block.text)}</code></pre>`;
		}
		if (block.type === "table") {
			const { align, header, rows } = block;
			const head = `<thead><tr>${cells("th", header, align)}</tr></thead>`;
			const bodyRows = rows
				.map((row) => `<tr>${cells("td", row, align)}</tr>`)
				.join("");
			return `<table>${head}${bodyRows ? `<tbody>${bodyRows}</tbody>` : ""}</table>`;
		}
		return `<p>${inline(block.text)}</p>`;
	};
	const html = document.blocks.map(render);

	// Notes may refer to further notes, which then join the end of the list.
	const items: string[] = [];
	for (let index = 0; index < notes.labels.length; index += 1) {
		const number = index + 1;
		const paragraphs = (document.notes.get(notes.labels[index]) ?? [])
			.filter(Boolean)
			.map(inline);
		const backlinks = Array.from(
			{ length: notes.references(notes.labels[index]) },
			(_, at) =>
				`<a href="#${noteRefId(number, at + 1)}" epub:type="backlink" role="doc-backlink">↩${at > 0 ? `<sup>${at + 1}</sup>` : ""}</a>`,
		).join(" ");
		if (paragraphs.length === 0) paragraphs.push("");
		const last = paragraphs.length - 1;
		paragraphs[last] = [paragraphs[last], backlinks].filter(Boolean).join(" ");
		const content = paragraphs.map((paragraph) => `<p>${paragraph}</p>`);
		items.push(`<li id="${noteId(number)}">${content.join("")}</li>`);
	}
	if (items.length > 0) {
		html.push(
			`<section class="notes" epub:type="endnotes" role="doc-endnotes"><h2>Notes</h2><ol>${items.join("")}</ol></section>`,
		);
	}
	return html.join("\n");
};
