import { escapeHtml } from "../utils/character-references";
import { isSafeLink } from "../utils/links";
import type {
	InlineImage,
	ListItem,
	MarkdownBlock,
	TableAlign,
} from "../utils/markdown-blocks";
import {
	type EntryMarkdown,
	parseEntryMarkdown,
} from "../utils/markdown-headings";
import {
	createNoteNumbers,
	type InlineNode,
	parseInline,
} from "../utils/markdown-inline";
import type { ExportEntryKind } from "./types";

/** Where a link should point in the output, or null to keep only its text. */
export type LinkResolver = (href: string) => string | null;

// Read UI sections, so a link to /read/<section>/<slug> can point inside an export.
const SECTION_KINDS: Record<string, ExportEntryKind> = {
	chapters: "chapter",
	mechanisms: "mechanism",
	toolkit: "tool",
	glossary: "glossary",
	examples: "example",
};
const READ_LINK = /^\/?read\/([a-z]+)\/([^?#]+)(?:\?[^#]*)?(?:#(.*))?$/;

/** The read UI section an entry's page is in: `/read/<section>/<slug>`. */
export const readSectionOf = (kind: ExportEntryKind): string =>
	Object.keys(SECTION_KINDS).find(
		(section) => SECTION_KINDS[section] === kind,
	) ?? kind;

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
	const cleaned = value.normalize("NFC").replace(/[^\p{L}\p{M}\p{N}_.-]/gu, "");
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

/** A `time` element's `datetime`, kept only when it is a date or time HTML accepts. */
const DATETIME =
	/^\d{4}-\d{2}(?:-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?)?$|^\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;

/** The attributes an inline element keeps in the EPUB: a title, and a valid `datetime` on `<time>`. */
const elementAttributes = (
	name: string,
	attributes: Record<string, string>,
): string => {
	let out = "";
	if (attributes.title) out += ` title="${escapeHtml(attributes.title)}"`;
	if (name === "time" && DATETIME.test(attributes.datetime ?? "")) {
		out += ` datetime="${escapeHtml(attributes.datetime)}"`;
	}
	return out;
};

/** A class for an HTML `align`, which XHTML no longer allows as an attribute. */
const alignClass = (align: TableAlign | undefined) =>
	align ? ` class="align-${align}"` : "";

/**
 * Markdown as XHTML that is always well formed and valid where EPUB readers
 * check it, ending with the footnotes it refers to as EPUB 3 endnotes, each
 * linking back to its references. Headings get the ids the site gives them.
 * `markdown` is a body, or an entry's body with the Markdown written from
 * its fields around it.
 */
export const markdownToHtml = (
	markdown: string | EntryMarkdown,
	resolveLink: LinkResolver = (href) => href,
	resolveImage: ImageResolver = (image) => image.src,
): string => {
	const { document, ids } = parseEntryMarkdown(
		typeof markdown === "string" ? { body: markdown } : markdown,
	);
	const notes = createNoteNumbers();
	// A link inside a link would not be valid XHTML; the inner one keeps its words.
	let inLink = false;
	const nodesHtml = (nodes: InlineNode[]): string =>
		nodes.map(nodeHtml).join("");
	const nodeHtml = (node: InlineNode): string => {
		switch (node.type) {
			case "text":
				return escapeHtml(node.text);
			case "code":
				return `<code>${escapeHtml(node.text)}</code>`;
			case "break":
				return "<br/>";
			case "strong":
			case "em":
			case "del":
				return `<${node.type}>${nodesHtml(node.children)}</${node.type}>`;
			case "element": {
				const inner = nodesHtml(node.children);
				// A <time> with no valid datetime would not be valid; its words stay.
				if (
					node.name === "time" &&
					!DATETIME.test(node.attributes.datetime ?? "")
				) {
					return inner;
				}
				return `<${node.name}${elementAttributes(node.name, node.attributes)}>${inner}</${node.name}>`;
			}
			case "link": {
				const target = inLink ? null : resolveLink(node.href);
				// Whatever the resolver returns, a script or data link is never written.
				if (target === null || !isSafeLink(target)) {
					return nodesHtml(node.children);
				}
				inLink = true;
				const inner = nodesHtml(node.children);
				inLink = false;
				return `<a href="${escapeHtml(target)}">${inner}</a>`;
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
				const id = noteRefId(number, count);
				// Inside a link the number cannot link to its note, but the note still links back.
				if (inLink) return `<sup id="${id}">${number}</sup>`;
				return `<sup><a id="${id}" href="#${noteId(number)}" epub:type="noteref" role="doc-noteref">${number}</a></sup>`;
			}
		}
	};
	// Trimmed: a tag left out at either end leaves its space behind.
	const inline = (text: string) =>
		nodesHtml(parseInline(text, document)).trim();
	const cells = (tag: "th" | "td", row: string[], align: TableAlign[]) =>
		row
			.map(
				(cell, column) =>
					`<${tag}${alignClass(align[column])}>${inline(cell)}</${tag}>`,
			)
			.join("");
	const blocksHtml = (blocks: MarkdownBlock[]) =>
		blocks.map(render).filter(Boolean).join("");
	// A task's box is a glyph, which shows wherever text does; not every reading system draws form controls.
	const taskBox = (item: ListItem) =>
		item.checked === undefined ? "" : `${item.checked ? "☑" : "☐"} `;
	const itemHtml = (item: ListItem) =>
		`<li>${taskBox(item)}${inline(item.text)}${blocksHtml(item.blocks)}</li>`;

	const render = (block: MarkdownBlock): string => {
		switch (block.type) {
			case "heading": {
				const level = Math.min(block.level, 6);
				const nodes = parseInline(block.text, document);
				// The site gives a heading written as an HTML tag no id.
				const siteId = ids.get(block);
				const id = siteId === undefined ? "" : xmlId(siteId);
				return `<h${level}${id ? ` id="${escapeHtml(id)}"` : ""}>${nodesHtml(nodes).trim()}</h${level}>`;
			}
			case "list": {
				const tag = block.ordered ? "ol" : "ul";
				const start =
					block.ordered && block.start !== 1 ? ` start="${block.start}"` : "";
				return `<${tag}${start}>${block.items.map(itemHtml).join("")}</${tag}>`;
			}
			case "quote":
				return `<blockquote><p>${inline(block.text)}</p></blockquote>`;
			case "code":
				return `<pre><code>${escapeHtml(block.text)}</code></pre>`;
			case "table": {
				const { align, header, rows } = block;
				const caption = block.caption
					? `<caption>${inline(block.caption)}</caption>`
					: "";
				const head = header
					? `<thead><tr>${cells("th", header, align)}</tr></thead>`
					: "";
				const bodyRows = rows
					.map((row) => `<tr>${cells("td", row, align)}</tr>`)
					.join("");
				return `<table>${caption}${head}${bodyRows ? `<tbody>${bodyRows}</tbody>` : ""}</table>`;
			}
			case "rule":
				return "<hr/>";
			case "details": {
				// Many EPUB readers cannot open a <details>, so its content always shows,
				// led by its summary.
				const summary = block.summary
					? `<p class="details__summary"><strong>${inline(block.summary)}</strong></p>`
					: "";
				return `<div class="details">${summary}${blocksHtml(block.blocks)}</div>`;
			}
			case "definitions":
				return `<dl>${block.items
					.map((item) =>
						"term" in item
							? `<dt>${inline(item.term)}</dt>`
							: `<dd>${blocksHtml(item.blocks)}</dd>`,
					)
					.join("")}</dl>`;
			case "section":
				return `<${block.tag}${alignClass(block.align)}>${blocksHtml(block.blocks)}</${block.tag}>`;
			case "caption":
				return `<figcaption>${inline(block.text)}</figcaption>`;
			case "paragraph": {
				const content = inline(block.text);
				// A paragraph of left-out tags (a component's opening line) shows nothing.
				if (!content) return "";
				return `<p${alignClass(block.align)}>${content}</p>`;
			}
		}
	};
	const html = document.blocks.map(render).filter(Boolean);

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
