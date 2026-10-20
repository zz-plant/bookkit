import { createSlugger, stripMarkdown } from "../utils/markdown";
import {
	type InlineImage,
	type MarkdownBlock,
	parseMarkdownBlocks,
	replaceImages,
} from "./markdown-blocks";
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

const CODE_SPAN = /`([^`]+)`/g;

/** What a reader sees in place of an image the export cannot carry. */
export const imageAltText = (image: InlineImage): string =>
	`[Image: ${image.alt.trim()}]`;
const LINK = /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
// Private-use characters bracket HTML that is set aside while emphasis is applied.
const HOLD_OPEN = String.fromCharCode(0xe000);
const HOLD_CLOSE = String.fromCharCode(0xe001);
const HELD = new RegExp(`${HOLD_OPEN}(\\d+)${HOLD_CLOSE}`, "g");

const applyEmphasis = (html: string) =>
	html
		.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
		.replace(
			/(^|[^\p{L}\p{N}_])__([^_]+)__(?![\p{L}\p{N}_])/gu,
			"$1<strong>$2</strong>",
		)
		.replace(/\*([^*]+)\*/g, "<em>$1</em>")
		.replace(/(^|[^\p{L}\p{N}_])_([^_]+)_(?![\p{L}\p{N}_])/gu, "$1<em>$2</em>");

const tagsNest = (html: string): boolean => {
	const open: string[] = [];
	for (const [, closing, name] of html.matchAll(/<(\/?)(strong|em)>/g)) {
		if (!closing) open.push(name);
		else if (open.pop() !== name) return false;
	}
	return open.length === 0;
};

/** Emphasis whose markers overlap (`**a _b** c_`) is left as written rather than mis-nested. */
const emphasize = (html: string) => {
	const rendered = applyEmphasis(html);
	return tagsNest(rendered) ? rendered : html;
};

/**
 * Inline Markdown as XHTML that is always well formed. Code spans and links
 * are set aside before emphasis is applied, so an underscore in
 * `snake_case` or a URL can never open a tag that closes somewhere else.
 */
export const renderInline = (
	value: string,
	resolveLink: LinkResolver = (href) => href,
	resolveImage: ImageResolver = (image) => image.src,
): string => {
	const held: string[] = [];
	const hold = (html: string) =>
		`${HOLD_OPEN}${held.push(html) - 1}${HOLD_CLOSE}`;
	// Drop any placeholder characters already in the text.
	let text = value.replaceAll(HOLD_OPEN, "").replaceAll(HOLD_CLOSE, "");
	text = text.replace(CODE_SPAN, (_, code: string) =>
		hold(`<code>${escapeHtml(code)}</code>`),
	);
	// Before links, which would otherwise take an image's `[alt](src)`.
	text = replaceImages(text, (image) => {
		const src = resolveImage(image);
		if (src !== null) {
			return hold(
				`<img src="${escapeHtml(src)}" alt="${escapeHtml(image.alt)}"/>`,
			);
		}
		return image.alt.trim()
			? hold(
					`<span class="image-alt">${escapeHtml(imageAltText(image))}</span>`,
				)
			: "";
	});
	text = text.replace(LINK, (_, label: string, href: string) => {
		const inner = emphasize(escapeHtml(label));
		const target = resolveLink(href);
		return hold(
			target === null ? inner : `<a href="${escapeHtml(target)}">${inner}</a>`,
		);
	});
	let html = emphasize(escapeHtml(text));
	// A link label can hold a code span, so restore until nothing is left.
	while (html.includes(HOLD_OPEN)) {
		html = html.replace(HELD, (_, index: string) => held[Number(index)]);
	}
	return html;
};

export const markdownToHtml = (
	body: string,
	resolveLink?: LinkResolver,
	resolveImage?: ImageResolver,
): string => {
	const slugger = createSlugger();
	const inline = (text: string) =>
		renderInline(text, resolveLink, resolveImage);
	const render = (block: MarkdownBlock): string => {
		if (block.type === "heading") {
			const level = Math.min(block.level, 6);
			const id = xmlId(slugger(stripMarkdown(block.text)));
			return `<h${level} id="${escapeHtml(id)}">${inline(block.text)}</h${level}>`;
		}
		if (block.type === "list") {
			const tag = block.ordered ? "ol" : "ul";
			const items = block.items.map((item) => `<li>${inline(item)}</li>`);
			return `<${tag}>${items.join("")}</${tag}>`;
		}
		if (block.type === "quote") {
			return `<blockquote><p>${inline(block.text)}</p></blockquote>`;
		}
		return `<p>${inline(block.text)}</p>`;
	};
	return parseMarkdownBlocks(body).map(render).join("\n");
};
