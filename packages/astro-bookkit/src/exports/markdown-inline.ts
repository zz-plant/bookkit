import {
	CHARACTER_REFERENCE,
	decodeCharacterReference,
} from "../utils/character-references";
import { embedTitle } from "../utils/html-allowlist";
import { normalizeLabel, smartDashes } from "../utils/markdown";
import {
	type InlineImage,
	MARKDOWN_IMAGE,
	type MarkdownDocument,
} from "./markdown-blocks";
import {
	HTML_TAG,
	type HtmlTag,
	IMG_TAG,
	INLINE_TAGS,
	readTag,
	tagAttribute,
} from "./markdown-html";

/**
 * Inline Markdown as a tree, so the EPUB (as XHTML) and the PDF (as runs of
 * text in its fonts) show the same words: code spans, emphasis, links
 * (inline and reference-style), images, footnote references, backslash
 * escapes, character references, and the inline HTML elements import keeps
 * (`<kbd>`, `<sup>`, `<br>`…). An embed (`<iframe src>`), which neither
 * format can show, is a link to the page it shows, named by its title.
 * Other tags are left out and their text kept.
 */
export type InlineNode =
	| { type: "text"; text: string }
	| { type: "code"; text: string }
	| { type: "strong" | "em" | "del"; children: InlineNode[] }
	| { type: "link"; href: string; children: InlineNode[] }
	| { type: "image"; image: InlineImage }
	/** A footnote reference; `label` is normalized. */
	| { type: "noteref"; label: string }
	/** An inline HTML element import keeps, such as `<kbd>`; `name` is lower case. */
	| {
			type: "element";
			name: string;
			attributes: Record<string, string>;
			children: InlineNode[];
	  }
	/** `<br>`. */
	| { type: "break" };

/** A node that holds others. */
type Parent = Extract<InlineNode, { children: InlineNode[] }>;
/** An inline HTML tag while its partner is looked for. */
type TagMark = { type: "tag"; tag: HtmlTag };
type Held = InlineNode | TagMark;

type Emphasis = "strong" | "em" | "del";

// Private-use characters stand in for parsed pieces while emphasis is
// matched, so an underscore in `snake_case` or a URL can never open emphasis
// that closes somewhere else.
const HOLD_OPEN = "\uE000";
const HOLD_CLOSE = "\uE001";
const HELD = /\uE000(\d+)\uE001/g;
const MARKERS: Record<Emphasis, [string, string]> = {
	strong: ["\uE002", "\uE003"],
	em: ["\uE004", "\uE005"],
	del: ["\uE006", "\uE007"],
};
const PRIVATE = /[\uE000-\uE007]/g;
const OPENS = new Map(
	Object.entries(MARKERS).map(([type, [open]]) => [open, type as Emphasis]),
);
const CLOSES = new Map(
	Object.values(MARKERS).map(([open, close]) => [close, open]),
);

const ASCII_PUNCTUATION = "[!-/:-@[-`{-~]";

// Read left to right, so whichever starts first wins: a backslash escape,
// a code span (backtick runs of equal length), a character reference, or a tag.
const ATOMS = new RegExp(
	[
		`\\\\(${ASCII_PUNCTUATION})`,
		"(?<!`)(`+)(?!`)([\\s\\S]*?[^`])\\2(?!`)",
		`(${CHARACTER_REFERENCE})`,
		`(${IMG_TAG})`,
		`(${HTML_TAG})`,
	].join("|"),
	"gi",
);
const IMAGE = new RegExp(
	`${MARKDOWN_IMAGE}|!\\[([^\\]]*)\\](?:\\[([^\\]]*)\\])?`,
	"g",
);
// A link's destination may hold balanced parentheses (`/wiki/Foo_(bar)`).
const LINK_OR_NOTE =
	/\[\^([^\]\s]+)\]|\[([^\]]+)\](?:\(((?:[^()\s]|\([^()\s]*\))+)(?:\s+"[^"]*")?\)|\[([^\]]*)\])?/g;
const UNESCAPE = new RegExp(
	`\\\\(${ASCII_PUNCTUATION})|${CHARACTER_REFERENCE}`,
	"g",
);

/** Text with backslash escapes and character references resolved, as a link destination is read. */
const unescapeText = (value: string) =>
	value.replace(
		UNESCAPE,
		(match, escaped?: string) =>
			escaped ?? decodeCharacterReference(match) ?? match,
	);

/** A held piece's words: nothing for a tag. */
const plainText = (node: Held) =>
	node.type === "tag" ? "" : inlinePlainText([node]);

/** A code span's content: one space trimmed from each end when both have one. */
const codeText = (code: string) =>
	/^ [\s\S]*[^ ][\s\S]* $/.test(code) ? code.slice(1, -1) : code;

/** The words of inline nodes, without markup: what an image's alt is made from. */
export const inlinePlainText = (nodes: InlineNode[]): string =>
	nodes
		.map((node) => {
			if (node.type === "text" || node.type === "code") return node.text;
			if (node.type === "image") return node.image.alt;
			if ("children" in node) return inlinePlainText(node.children);
			return "";
		})
		.join("");

/**
 * A heading's text as the site slugs it into the heading's id: the text the
 * page shows, with smart punctuation's dashes in prose (not in code), and
 * no image alt text.
 */
export const headingSlugText = (nodes: InlineNode[]): string =>
	nodes
		.map((node) => {
			if (node.type === "text") return smartDashes(node.text);
			if (node.type === "code") return node.text;
			if ("children" in node) return headingSlugText(node.children);
			return "";
		})
		.join("");

const applyEmphasis = (text: string) => {
	const { strong, em, del } = MARKERS;
	return text
		.replace(/\*\*([^*]+)\*\*/g, `${strong[0]}$1${strong[1]}`)
		.replace(
			/(^|[^\p{L}\p{N}_])__([^_]+)__(?![\p{L}\p{N}_])/gu,
			`$1${strong[0]}$2${strong[1]}`,
		)
		.replace(/\*([^*]+)\*/g, `${em[0]}$1${em[1]}`)
		.replace(
			/(^|[^\p{L}\p{N}_])_([^_]+)_(?![\p{L}\p{N}_])/gu,
			`$1${em[0]}$2${em[1]}`,
		)
		.replace(/~~([^~]+)~~/g, `${del[0]}$1${del[1]}`);
};

/**
 * The inline tags in `text` that pair up, as HTML pairs them: each closing
 * tag's placeholder index, mapped to its opening tag's. A tag with no
 * partner in `text` is left out, keeping its content.
 */
const pairTags = (text: string, held: Held[]): Map<number, number> => {
	const partners = new Map<number, number>();
	const open: Array<{ index: number; name: string }> = [];
	for (const [, index] of text.matchAll(HELD)) {
		const node = held[Number(index)];
		if (node.type !== "tag") continue;
		if (!node.tag.closing) {
			open.push({ index: Number(index), name: node.tag.name });
			continue;
		}
		const at = open.map((tag) => tag.name).lastIndexOf(node.tag.name);
		if (at < 0) continue;
		partners.set(Number(index), open[at].index);
		open.length = at;
	}
	return partners;
};

const PIECES = /\uE000(\d+)\uE001|[\uE002-\uE007]/g;

/** Whether the emphasis markers nest, with each other and with the tags that pair. */
const markersNest = (text: string, held: Held[]): boolean => {
	const partners = pairTags(text, held);
	const opens = new Set(partners.values());
	const open: string[] = [];
	for (const [piece, index] of text.matchAll(PIECES)) {
		if (index === undefined) {
			if (OPENS.has(piece)) open.push(piece);
			else if (open.pop() !== CLOSES.get(piece)) return false;
		} else if (opens.has(Number(index))) {
			open.push(index);
		} else if (
			partners.has(Number(index)) &&
			open.pop() !== String(partners.get(Number(index)))
		) {
			return false;
		}
	}
	return open.length === 0;
};

/** Emphasis whose markers overlap (`**a _b** c_`, `**a <kbd>b** c</kbd>`) is left as written rather than mis-nested. */
const emphasize = (text: string, held: Held[]) => {
	const marked = applyEmphasis(text);
	return markersNest(marked, held) ? marked : text;
};

/** The node an inline tag opens: a link for `<a href>`, else the element. */
const openedBy = (tag: HtmlTag): Parent => {
	const { href } = tag.attributes;
	if (tag.name === "a" && href) return { type: "link", href, children: [] };
	return {
		type: "element",
		name: tag.name === "a" ? "span" : tag.name,
		attributes: tag.name === "a" ? {} : tag.attributes,
		children: [],
	};
};

/** Text holding placeholders and emphasis markers, as nodes. */
const toNodes = (text: string, held: Held[]): InlineNode[] => {
	const partners = pairTags(text, held);
	const opens = new Set(partners.values());
	const root: InlineNode[] = [];
	const stack: InlineNode[][] = [root];
	const add = (node: InlineNode) => {
		const siblings = stack[stack.length - 1];
		const last = siblings[siblings.length - 1];
		if (node.type === "text" && last?.type === "text") last.text += node.text;
		else siblings.push(node.type === "text" ? { ...node } : node);
	};
	const enter = (node: Parent) => {
		add(node);
		stack.push(node.children);
	};
	let at = 0;
	while (at < text.length) {
		const char = text[at];
		if (char === HOLD_OPEN) {
			const end = text.indexOf(HOLD_CLOSE, at);
			const index = Number(text.slice(at + 1, end));
			const node = held[index];
			if (node.type !== "tag") add(node);
			else if (opens.has(index)) {
				enter(openedBy(node.tag));
			} else if (partners.has(index)) stack.pop();
			at = end + 1;
			continue;
		}
		const emphasis = OPENS.get(char);
		if (emphasis) {
			enter({ type: emphasis, children: [] });
		} else if (CLOSES.has(char)) {
			stack.pop();
		} else {
			add({ type: "text", text: char });
		}
		at += 1;
	}
	return root;
};

/**
 * One block's inline Markdown as nodes. `document` holds the definitions
 * reference-style links and footnote references point to; a reference with
 * no definition stays as written.
 */
export const parseInline = (
	value: string,
	document: Pick<MarkdownDocument, "links" | "notes">,
): InlineNode[] => {
	const held: Held[] = [];
	const sources: string[] = [];
	const hold = (node: Held, source: string) => {
		sources.push(source);
		return `${HOLD_OPEN}${held.push(node) - 1}${HOLD_CLOSE}`;
	};
	/** `text` with its placeholders put back as written, or as plain text. */
	const restore = (text: string, as: "source" | "plain") => {
		let out = text;
		// An image's source can itself hold a code span's placeholder.
		while (out.includes(HOLD_OPEN)) {
			out = out.replace(HELD, (_, index: string) =>
				as === "source"
					? sources[Number(index)]
					: plainText(held[Number(index)]),
			);
		}
		return out;
	};
	const definition = (label: string) =>
		document.links.get(normalizeLabel(restore(label, "source")));

	let text = value.replace(PRIVATE, "");
	text = text.replace(
		ATOMS,
		(
			source,
			escaped?: string,
			_ticks?: string,
			code?: string,
			reference?: string,
			img?: string,
		) => {
			if (escaped !== undefined) {
				return hold({ type: "text", text: escaped }, source);
			}
			if (code !== undefined) {
				return hold({ type: "code", text: codeText(code) }, source);
			}
			if (reference !== undefined) {
				const decoded = decodeCharacterReference(reference);
				return decoded === null
					? source
					: hold({ type: "text", text: decoded }, source);
			}
			const src = img === undefined ? undefined : tagAttribute(img, "src");
			if (src) {
				const alt = tagAttribute(source, "alt") ?? "";
				return hold({ type: "image", image: { src, alt } }, source);
			}
			const tag = readTag(source);
			if (tag?.name === "br") return hold({ type: "break" }, source);
			const embedded = tag?.name === "iframe" ? tag.attributes.src : "";
			if (embedded?.trim() && !tag?.closing) {
				const title = tag?.attributes.title?.trim() || embedTitle(embedded);
				return hold(
					{
						type: "link",
						href: embedded,
						children: [{ type: "text", text: title }],
					},
					source,
				);
			}
			if (tag && INLINE_TAGS.has(tag.name) && !tag.empty) {
				return hold({ type: "tag", tag }, source);
			}
			// Any other tag is left out; the text around it stays.
			return hold({ type: "text", text: "" }, source);
		},
	);
	// Before links, which would otherwise take an image's `[alt](src)`.
	text = text.replace(
		IMAGE,
		(source, alt?: string, src?: string, refAlt?: string, ref?: string) => {
			const target = src ?? definition(ref || (refAlt as string));
			if (target === undefined) return source;
			const image = {
				alt: restore(alt ?? refAlt ?? "", "plain"),
				src: src === undefined ? unescapeText(target) : restore(src, "plain"),
			};
			return hold({ type: "image", image }, source);
		},
	);
	text = text.replace(
		LINK_OR_NOTE,
		(source, note?: string, label?: string, href?: string, ref?: string) => {
			if (note !== undefined) {
				const key = normalizeLabel(restore(note, "source"));
				return document.notes.has(key)
					? hold({ type: "noteref", label: key }, source)
					: source;
			}
			const target =
				href === undefined
					? definition(ref || (label as string))
					: restore(href, "plain");
			if (target === undefined) return source;
			const link: InlineNode = {
				type: "link",
				href: href === undefined ? unescapeText(target) : target,
				children: toNodes(emphasize(label as string, held), held),
			};
			return hold(link, source);
		},
	);
	return toNodes(emphasize(text, held), held);
};

/**
 * Footnote numbers in the order the text first refers to them, as GFM
 * numbers them; a note referred to twice keeps its number.
 */
export const createNoteNumbers = () => {
	const labels: string[] = [];
	const counts = new Map<string, number>();
	return {
		/** The note's number, and how many references to it there now are (1 for the first). */
		refer: (label: string) => {
			if (!counts.has(label)) labels.push(label);
			const count = (counts.get(label) ?? 0) + 1;
			counts.set(label, count);
			return { number: labels.indexOf(label) + 1, count };
		},
		/** Referred-to labels in number order; it grows when a note refers to another. */
		labels: labels as readonly string[],
		/** How many references to the note there are. */
		references: (label: string) => counts.get(label) ?? 0,
	};
};

export type NoteNumbers = ReturnType<typeof createNoteNumbers>;
