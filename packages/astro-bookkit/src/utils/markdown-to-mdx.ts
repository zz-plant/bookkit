import { decodeEntities, escapeHtml } from "./character-references";
import {
	attributeRefusal,
	BLOCK_ELEMENTS,
	EMBEDDED_ELEMENTS,
	embedTitle,
	KEPT_ELEMENTS,
	VOID_ELEMENTS,
} from "./html-allowlist";
import { type MarkdownSegment, splitFencedCode } from "./markdown-text";
import {
	findUnsafeMarkup,
	type UnsafeMarkup,
	withoutUnsafeMarkup,
} from "./markdown-unsafe";

/**
 * Markdown made safe to compile as MDX (`toMdxBody`), for import: comments,
 * autolinks, braces, and tag-like text rewritten or escaped, and raw HTML
 * escaped or kept as JSX.
 */

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
	/** Embeds (`<iframe>`) given a title, from the page they show, so a screen reader can name them (`html: "jsx"` only). */
	titles: number;
};

export type MdxBodyOptions = {
	/**
	 * Raw HTML: `escape` (the default) shows it as text. `jsx` keeps common
	 * elements (`KEPT_ELEMENTS`: `<details>`, `<kbd>`, `<img>`, tables, …)
	 * and embedded pages (`EMBEDDED_ELEMENTS`) as HTML: void tags are closed,
	 * attribute values quoted, and a block tag that opens on one line and
	 * closes on another gets a line of its own. Tags it cannot pair, and
	 * other elements, are escaped. MDX is stricter than HTML about where a
	 * block may open and close, so compile the result and fall back to
	 * `escape` if it fails. Either way, what the allowlist does not keep is
	 * gone first (`findUnsafeMarkup`).
	 */
	html?: "escape" | "jsx";
};

const INLINE_CODE = /(`+)[\s\S]*?\1/g;
const HTML_COMMENT = /<!--([\s\S]*?)-->/g;
const HTML_TAG =
	/<(\/?)([A-Za-z][A-Za-z0-9-]*)((?:\s+[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g;
const HTML_ATTRIBUTE =
	/([^\s"'<>/=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g;

/** One `<tag>` in prose, and how `toMdxBody` writes it. */
type TagToken = {
	name: string;
	closing: boolean;
	/** The tag as MDX accepts it; null when it is escaped instead. */
	jsx: string | null;
	/** An embed import gave a title. */
	titled?: boolean;
	/** Paired with its closing (or opening) tag, or self-contained. */
	paired: boolean;
	line: number;
	partnerLine?: number;
};

/**
 * The tag rewritten as JSX MDX accepts, or null when it must be escaped. An
 * embed with no title gets one from the page it shows (`embedTitle`), so a
 * screen reader can name it; `titled` says so.
 */
const tagAsJsx = (
	closing: string,
	rawName: string,
	rawAttributes: string,
	selfClosing: string,
): { jsx: string; titled: boolean } | null => {
	const name = rawName.toLowerCase();
	const embedded = EMBEDDED_ELEMENTS.has(name);
	if (!KEPT_ELEMENTS.has(name) && !embedded) return null;
	if (closing) {
		return rawAttributes.trim() ? null : { jsx: `</${name}>`, titled: false };
	}
	const attributes: string[] = [];
	let source = "";
	let titled = false;
	for (const [, key, value] of rawAttributes.matchAll(HTML_ATTRIBUTE)) {
		const text = decodeEntities(
			value?.replace(/^(["'])([\s\S]*)\1$/, "$2") ?? "",
		);
		// `findUnsafeMarkup` has removed what the allowlist refuses; a tag it
		// read differently is shown as text.
		if (
			!/^[A-Za-z_:][-A-Za-z0-9_:.]*$/.test(key) ||
			attributeRefusal(name, key, text)
		) {
			return null;
		}
		if (key.toLowerCase() === "src") source = text.trim();
		titled ||= key.toLowerCase() === "title" && Boolean(text.trim());
		if (value === undefined) attributes.push(key);
		else if (/^["']/.test(value)) attributes.push(`${key}=${value}`);
		else attributes.push(`${key}="${value}"`);
	}
	if (embedded && !source) return null;
	const named = embedded && !titled;
	if (named) attributes.push(`title="${escapeHtml(embedTitle(source))}"`);
	const open = [name, ...attributes].join(" ");
	return {
		jsx: VOID_ELEMENTS.has(name) || selfClosing ? `<${open} />` : `<${open}>`,
		titled: named,
	};
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

/**
 * A bare `https://…` or `www.…` that runs into an escaped `<`. GFM reads
 * such an address up to the next space or `<`, a `\` included, so in
 * `https://example.com/\<id>` the address takes the `\` and MDX reads
 * `<id>` as a tag: the file does not compile. With its `:` (or the `.` of
 * `www.`) escaped, the address does not start there; it reads the same.
 */
const AUTOLINK_INTO_TAG =
	/(?<![A-Za-z])https?(?=:\/\/[^\s<]*\\<)|(?<=^|[\s(*_~[\]])www(?=\.[^\s<]*\\<)/gi;

/**
 * Escapes text that is neither code, a comment, nor a kept tag, including
 * the `:` of an address that runs into an escaped `<` (`AUTOLINK_INTO_TAG`).
 */
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
		})
		.replace(AUTOLINK_INTO_TAG, (scheme) => `${scheme}\\`);

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
			const kept = tagAsJsx(closing, name, attributes, selfClosing);
			const jsx = kept?.jsx ?? null;
			const token: TagToken = {
				name: name.toLowerCase(),
				closing: Boolean(closing),
				// Escaping keeps only line breaks, which never break a block.
				jsx: html === "jsx" || jsx === "<br />" ? jsx : null,
				titled: kept?.titled,
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
	// Text and escaped tags in a row are escaped together, so an address in
	// one and the `<` that ends it in the next are seen as one run.
	let text = "";
	const writeText = () => {
		out += escapeText(text, counts);
		text = "";
	};
	pieces.forEach((piece, index) => {
		if (
			piece.kind === "text" ||
			(piece.kind === "tag" &&
				(piece.token.jsx === null || !piece.token.paired))
		) {
			text += piece.text;
			return;
		}
		writeText();
		if (piece.kind === "code") {
			out += piece.text;
		} else if (piece.kind === "comment") {
			counts.htmlComments += 1;
			out += `{/*${piece.inner.replace(/\*\//g, "* /")}*/}`;
		} else {
			const { token } = piece;
			if (token.jsx !== "<br />") counts.html += 1;
			if (token.titled) counts.titles += 1;
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
	writeText();
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
 * written. Raw HTML is escaped too, or kept with `html: "jsx"`. What the
 * site would not keep (`findUnsafeMarkup`) goes first: a link to an unsafe
 * address becomes its text, a script or style goes with what it holds, and
 * a kept element loses the attributes the allowlist refuses. Each is listed
 * in `unsafeMarkup` with its line in `source`. Code (fenced or inline) is
 * left exactly as it was. MDX has no indented code blocks, so indented text
 * is treated as prose, as MDX itself would.
 */
export const toMdxBody = (
	source: string,
	options: MdxBodyOptions = {},
): { body: string; changes: MdxConversion; unsafeMarkup: UnsafeMarkup[] } => {
	// Notes are Markdown, whose tag names HTML reads in any case; the tags
	// import keeps are written in lower case.
	const unsafeMarkup = findUnsafeMarkup(source, { tags: "html" });
	const markdown = withoutUnsafeMarkup(source, { tags: "html" });
	const changes: MdxConversion = {
		htmlComments: 0,
		braces: 0,
		autolinks: 0,
		tags: 0,
		html: 0,
		esm: 0,
		titles: 0,
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
	return { body, changes, unsafeMarkup };
};
