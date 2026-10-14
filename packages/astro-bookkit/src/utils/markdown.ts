export const createSlugger = () => {
	const used = new Map<string, number>();
	return (value: string) => {
		const base = value
			.toLowerCase()
			.trim()
			.replace(/[`~!@#$%^&*()=+[{}\]\\|;:'",.<>/?]/g, "")
			.replace(/\s+/g, "-")
			.replace(/-+/g, "-")
			.replace(/^-/, "")
			.replace(/-$/, "");
		const count = used.get(base) ?? 0;
		used.set(base, count + 1);
		if (!base) return "section";
		return count ? `${base}-${count}` : base;
	};
};

export const stripMarkdown = (value: string) => {
	return value
		.replace(/`{1,3}[^`]*`{1,3}/g, "")
		.replace(/\[(.*?)\]\([^)]*\)/g, "$1")
		.replace(/\*\*(.*?)\*\*/g, "$1")
		.replace(/\*(.*?)\*/g, "$1")
		.replace(/_{1,3}(.*?)_{1,3}/g, "$1")
		.replace(/~~(.*?)~~/g, "$1")
		.replace(/<[^>]+>/g, "")
		.replace(/^\s*[-*+]\s+/g, "")
		.replace(/^\s*\d+\.\s+/g, "")
		.trim();
};

/** What `toMdxBody` changed, by kind, so an import can say what it did. */
export type MdxConversion = {
	/** HTML comments rewritten as MDX comments. */
	htmlComments: number;
	/** `{` or `}` escaped, which MDX would read as a JavaScript expression. */
	braces: number;
	/** `<https://…>` autolinks, which MDX does not support, rewritten as links. */
	autolinks: number;
	/** `<` escaped that MDX would read as the start of a JSX tag (placeholders like `<service>`, `<=`, raw HTML shown as text). */
	tags: number;
	/** Raw HTML tags kept as HTML in the stricter form MDX accepts (`html: "jsx"` only). */
	html: number;
	/** Lines starting with `import` or `export`, which MDX would run as code. */
	esm: number;
};

export type MdxBodyOptions = {
	/**
	 * Raw HTML: `escape` (the default) shows it as text. `jsx` keeps common
	 * elements (`<details>`, `<kbd>`, `<img>`, tables, …) as HTML: void tags
	 * are closed, attribute values quoted, and a block tag that opens on one
	 * line and closes on another gets a line of its own. Tags it cannot pair,
	 * other elements, and event-handler attributes are escaped. MDX is stricter
	 * than HTML about where a block may open and close, so compile the result
	 * and fall back to `escape` if it fails.
	 */
	html?: "escape" | "jsx";
};

/** A run of prose or fenced code; `line` is the 0-based line it starts on. */
export type MarkdownSegment = { code: boolean; text: string; line: number };

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const INLINE_CODE = /(`+)[\s\S]*?\1/g;
const HTML_COMMENT = /<!--([\s\S]*?)-->/g;
const HTML_TAG =
	/<(\/?)([A-Za-z][A-Za-z0-9-]*)((?:\s+[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g;
const HTML_ATTRIBUTE =
	/([^\s"'<>/=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g;

const VOID_ELEMENTS = new Set(["br", "col", "hr", "img", "source", "wbr"]);
const BLOCK_ELEMENTS = new Set([
	"article",
	"aside",
	"blockquote",
	"caption",
	"center",
	"colgroup",
	"dd",
	"details",
	"div",
	"dl",
	"dt",
	"figcaption",
	"figure",
	"footer",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"header",
	"li",
	"ol",
	"p",
	"section",
	"summary",
	"table",
	"tbody",
	"td",
	"tfoot",
	"th",
	"thead",
	"tr",
	"ul",
]);
/** Elements `html: "jsx"` keeps: presentational HTML that Markdown notes use. */
const KEPT_ELEMENTS = new Set([
	...VOID_ELEMENTS,
	...BLOCK_ELEMENTS,
	"a",
	"abbr",
	"b",
	"cite",
	"code",
	"del",
	"dfn",
	"em",
	"i",
	"ins",
	"kbd",
	"mark",
	"picture",
	"q",
	"s",
	"samp",
	"small",
	"span",
	"strong",
	"sub",
	"sup",
	"time",
	"u",
	"var",
]);

/** Splits Markdown into runs of prose and fenced code, in order. */
export const splitFencedCode = (markdown: string): MarkdownSegment[] => {
	const segments: MarkdownSegment[] = [];
	let current: MarkdownSegment | null = null;
	let fence: string | null = null;
	markdown.split("\n").forEach((line, index) => {
		const marker = line.match(FENCE)?.[1];
		const opens = !fence && Boolean(marker);
		const code = Boolean(fence) || opens;
		if (opens && marker) fence = marker;
		else if (
			fence &&
			marker &&
			marker[0] === fence[0] &&
			marker.length >= fence.length
		) {
			fence = null;
		}
		// A fence that opens right after another closes starts a new block.
		if (current && current.code === code && !opens) {
			current.text += `\n${line}`;
		} else {
			current = { code, text: line, line: index };
			segments.push(current);
		}
	});
	return segments;
};

/** One `<tag>` in prose, and how `toMdxBody` writes it. */
type TagToken = {
	name: string;
	closing: boolean;
	/** The tag as MDX accepts it; null when it is escaped instead. */
	jsx: string | null;
	/** Paired with its closing (or opening) tag, or self-contained. */
	paired: boolean;
	line: number;
	partnerLine?: number;
};

/** The tag rewritten as JSX MDX accepts, or null when it must be escaped. */
const tagAsJsx = (
	closing: string,
	rawName: string,
	rawAttributes: string,
	selfClosing: string,
): string | null => {
	const name = rawName.toLowerCase();
	if (!KEPT_ELEMENTS.has(name)) return null;
	if (closing) return rawAttributes.trim() ? null : `</${name}>`;
	const attributes: string[] = [];
	for (const [, key, value] of rawAttributes.matchAll(HTML_ATTRIBUTE)) {
		if (!/^[A-Za-z_:][-A-Za-z0-9_:.]*$/.test(key) || /^on/i.test(key)) {
			return null;
		}
		if (value === undefined) attributes.push(key);
		else if (/^["']/.test(value)) attributes.push(`${key}=${value}`);
		else attributes.push(`${key}="${value}"`);
	}
	const open = [name, ...attributes].join(" ");
	return VOID_ELEMENTS.has(name) || selfClosing ? `<${open} />` : `<${open}>`;
};

/** Pairs opening and closing tags across the document, as HTML nests them. */
const pairTags = (tokens: TagToken[]): void => {
	const open: TagToken[] = [];
	for (const token of tokens) {
		if (token.jsx === null) continue;
		if (token.jsx.endsWith("/>")) {
			token.paired = true;
			continue;
		}
		if (!token.closing) {
			open.push(token);
			continue;
		}
		const at = open.map((t) => t.name).lastIndexOf(token.name);
		if (at < 0) continue;
		const opener = open[at];
		opener.paired = token.paired = true;
		opener.partnerLine = token.line;
		token.partnerLine = opener.line;
		// Tags opened inside it and never closed stay unpaired.
		open.length = at;
	}
};

/** Escapes text that is neither code, a comment, nor a kept tag. */
const escapeText = (text: string, counts: MdxConversion): string =>
	text
		.replace(/<(https?:\/\/[^\s<>]+)>/g, (_, url: string) => {
			counts.autolinks += 1;
			return `[${url}](${url})`;
		})
		.replace(/[{}]/g, (brace) => {
			counts.braces += 1;
			return `\\${brace}`;
		})
		// `<` starts a JSX tag in MDX unless whitespace follows it.
		.replace(/<(?![ \t\n])/g, () => {
			counts.tags += 1;
			return "\\<";
		});

type ProsePiece =
	| { kind: "code"; text: string }
	| { kind: "text"; text: string }
	| { kind: "comment"; text: string; inner: string }
	| { kind: "tag"; text: string; token: TagToken };

/** Splits a run of prose into inline code, comments, tags, and text. */
const tokenizeProse = (
	segment: MarkdownSegment,
	html: "escape" | "jsx",
	tokens: TagToken[],
): ProsePiece[] => {
	const pieces: ProsePiece[] = [];
	const lineAt = (index: number) =>
		segment.line + (segment.text.slice(0, index).match(/\n/g)?.length ?? 0);
	const pushTags = (text: string, offset: number) => {
		let last = 0;
		for (const match of text.matchAll(HTML_TAG)) {
			const index = match.index ?? 0;
			const [raw, closing, name, attributes, selfClosing] = match;
			const jsx = tagAsJsx(closing, name, attributes, selfClosing);
			const token: TagToken = {
				name: name.toLowerCase(),
				closing: Boolean(closing),
				// Escaping keeps only line breaks, which never break a block.
				jsx: html === "jsx" || jsx === "<br />" ? jsx : null,
				paired: false,
				line: lineAt(offset + index),
			};
			tokens.push(token);
			if (index > last)
				pieces.push({ kind: "text", text: text.slice(last, index) });
			pieces.push({ kind: "tag", text: raw, token });
			last = index + raw.length;
		}
		if (last < text.length)
			pieces.push({ kind: "text", text: text.slice(last) });
	};
	const pushComments = (text: string, offset: number) => {
		let last = 0;
		for (const match of text.matchAll(HTML_COMMENT)) {
			const index = match.index ?? 0;
			pushTags(text.slice(last, index), offset + last);
			pieces.push({ kind: "comment", text: match[0], inner: match[1] });
			last = index + match[0].length;
		}
		pushTags(text.slice(last), offset + last);
	};
	let last = 0;
	for (const match of segment.text.matchAll(INLINE_CODE)) {
		const index = match.index ?? 0;
		pushComments(segment.text.slice(last, index), last);
		pieces.push({ kind: "code", text: match[0] });
		last = index + match[0].length;
	}
	pushComments(segment.text.slice(last), last);
	return pieces;
};

/** Writes a tokenized run of prose back out as MDX. */
const writeProse = (pieces: ProsePiece[], counts: MdxConversion): string => {
	let out = "";
	pieces.forEach((piece, index) => {
		if (piece.kind === "code") {
			out += piece.text;
		} else if (piece.kind === "comment") {
			counts.htmlComments += 1;
			out += `{/*${piece.inner.replace(/\*\//g, "* /")}*/}`;
		} else if (piece.kind === "text") {
			out += escapeText(piece.text, counts);
		} else if (piece.token.jsx === null || !piece.token.paired) {
			out += escapeText(piece.text, counts);
		} else {
			const { token } = piece;
			if (token.jsx !== "<br />") counts.html += 1;
			// MDX closes a block only where it opened: in the same paragraph, or
			// on a line of its own. A block tag whose partner is on another line
			// gets a line of its own.
			const ownLine =
				BLOCK_ELEMENTS.has(token.name) &&
				token.partnerLine !== undefined &&
				token.partnerLine !== token.line;
			const lineStart = out.lastIndexOf("\n") + 1;
			const indent = out.slice(lineStart).match(/^[ \t]*/)?.[0] ?? "";
			if (ownLine && out.slice(lineStart).trim()) out += `\n${indent}`;
			out += token.jsx;
			const rest = pieces
				.slice(index + 1)
				.map((next) => next.text)
				.join("")
				.split("\n")[0];
			if (ownLine && rest.trim()) out += `\n${indent}`;
		}
	});
	// A line starting with `import` or `export` is code to MDX.
	return out.replace(/^(i)(?=mport[ \t])|^(e)(?=xport[ \t])/gm, (letter) => {
		counts.esm += 1;
		return letter === "i" ? "&#105;" : "&#101;";
	});
};

/**
 * Makes Markdown safe to compile as MDX, which book apps load: HTML comments
 * become MDX comments, autolinks become links, and braces, tag-like `<`, and
 * lines MDX would read as `import`/`export` are escaped so they render as
 * written. Raw HTML is escaped too, or kept with `html: "jsx"`. Code (fenced
 * or inline) is left exactly as it was. MDX has no indented code blocks, so
 * indented text is treated as prose, as MDX itself would.
 */
export const toMdxBody = (
	markdown: string,
	options: MdxBodyOptions = {},
): { body: string; changes: MdxConversion } => {
	const changes: MdxConversion = {
		htmlComments: 0,
		braces: 0,
		autolinks: 0,
		tags: 0,
		html: 0,
		esm: 0,
	};
	const tokens: TagToken[] = [];
	const segments = splitFencedCode(markdown).map((segment) =>
		segment.code
			? { segment }
			: {
					segment,
					pieces: tokenizeProse(segment, options.html ?? "escape", tokens),
				},
	);
	pairTags(tokens);
	const body = segments
		.map(({ segment, pieces }) =>
			pieces ? writeProse(pieces, changes) : segment.text,
		)
		.join("\n");
	return { body, changes };
};
