import {
	CHARACTER_REFERENCE,
	decodeCharacterReference,
	IMG_TAG,
	type InlineImage,
	MARKDOWN_IMAGE,
	type MarkdownDocument,
	normalizeLabel,
	tagAttribute,
} from "./markdown-blocks";

/**
 * Inline Markdown as a tree, so the EPUB (as XHTML) and the PDF (as runs of
 * text in its fonts) show the same words: code spans, emphasis, links
 * (inline and reference-style), images, footnote references, backslash
 * escapes, and character references.
 */
export type InlineNode =
	| { type: "text"; text: string }
	| { type: "code"; text: string }
	| { type: "strong" | "em" | "del"; children: InlineNode[] }
	| { type: "link"; href: string; children: InlineNode[] }
	| { type: "image"; image: InlineImage }
	/** A footnote reference; `label` is normalized. */
	| { type: "noteref"; label: string }
	/** A raw HTML or JSX tag, as written. */
	| { type: "html"; text: string };

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
const HTML_TAG =
	"</?[A-Za-z][\\w.:-]*(?:\\s+[^\\s\"'<>/=]+(?:\\s*=\\s*(?:\"[^\"]*\"|'[^']*'|\\{[^{}]*\\}|[^\\s\"'=<>`]+))?)*\\s*/?>";

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
const LINK_OR_NOTE =
	/\[\^([^\]\s]+)\]|\[([^\]]+)\](?:\(([^)\s]+)(?:\s+"[^"]*")?\)|\[([^\]]*)\])?/g;
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

/** A code span's content: one space trimmed from each end when both have one. */
const codeText = (code: string) =>
	/^ [\s\S]*[^ ][\s\S]* $/.test(code) ? code.slice(1, -1) : code;

/** The words of inline nodes, without markup: what a heading's id or an image's alt is made from. */
export const inlinePlainText = (nodes: InlineNode[]): string =>
	nodes
		.map((node) => {
			if (node.type === "text" || node.type === "code") return node.text;
			if (node.type === "image") return node.image.alt;
			if ("children" in node) return inlinePlainText(node.children);
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

const markersNest = (text: string): boolean => {
	const open: string[] = [];
	for (const char of text) {
		if (OPENS.has(char)) open.push(char);
		else if (CLOSES.has(char) && open.pop() !== CLOSES.get(char)) return false;
	}
	return open.length === 0;
};

/** Emphasis whose markers overlap (`**a _b** c_`) is left as written rather than mis-nested. */
const emphasize = (text: string) => {
	const marked = applyEmphasis(text);
	return markersNest(marked) ? marked : text;
};

/** Text holding placeholders and emphasis markers, as nodes. */
const toNodes = (text: string, held: InlineNode[]): InlineNode[] => {
	const root: InlineNode[] = [];
	const stack: InlineNode[][] = [root];
	const add = (node: InlineNode) => {
		const siblings = stack[stack.length - 1];
		const last = siblings[siblings.length - 1];
		if (node.type === "text" && last?.type === "text") last.text += node.text;
		else siblings.push(node.type === "text" ? { ...node } : node);
	};
	let at = 0;
	while (at < text.length) {
		const char = text[at];
		if (char === HOLD_OPEN) {
			const end = text.indexOf(HOLD_CLOSE, at);
			add(held[Number(text.slice(at + 1, end))]);
			at = end + 1;
			continue;
		}
		const emphasis = OPENS.get(char);
		if (emphasis) {
			const children: InlineNode[] = [];
			add({ type: emphasis, children });
			stack.push(children);
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
	const held: InlineNode[] = [];
	const sources: string[] = [];
	const hold = (node: InlineNode, source: string) => {
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
					: inlinePlainText([held[Number(index)]]),
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
			return src
				? hold(
						{
							type: "image",
							image: { src, alt: tagAttribute(source, "alt") ?? "" },
						},
						source,
					)
				: hold({ type: "html", text: source }, source);
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
				children: toNodes(emphasize(label as string), held),
			};
			return hold(link, source);
		},
	);
	return toNodes(emphasize(text), held);
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
