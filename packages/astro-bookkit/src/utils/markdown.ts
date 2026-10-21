import GithubSlugger from "github-slugger";
import { decodeEntities } from "./character-references";
import {
	type AttributeRefusal,
	attributeRefusal,
	BLOCK_ELEMENTS,
	componentPropRefusal,
	EMBEDDED_ELEMENTS,
	elementVerdict,
	isAddressAttribute,
	isCommentExpression,
	KEPT_ELEMENTS,
	literalValue,
	VOID_ELEMENTS,
} from "./html-allowlist";
import { isSafeLink } from "./links";

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

/**
 * Heading ids as the site gives them: Astro's Markdown processor slugs each
 * heading's text with github-slugger, one slugger per page, so a repeated
 * heading gets `-1`, `-2`. Pass the text as the page shows it: code spans
 * as written, other text through `smartDashes`.
 */
export const createHeadingSlugger = () => {
	const slugger = new GithubSlugger();
	return (text: string) => slugger.slug(text);
};

/**
 * Runs of hyphens as the en and em dashes smart punctuation makes of them
 * (CommonMark's rules, which Astro applies to prose but not to code): `--`
 * is an en dash, `---` an em dash, and longer runs mix them, em dashes first.
 */
export const smartDashes = (text: string): string =>
	text.replace(/-{2,}/g, ({ length }) => {
		const [em, en] =
			length % 3 === 0
				? [length / 3, 0]
				: length % 2 === 0
					? [0, length / 2]
					: length % 3 === 2
						? [(length - 2) / 3, 1]
						: [(length - 4) / 3, 2];
		return "\u2014".repeat(em) + "\u2013".repeat(en);
	});

// A code span, or a backslash escape (`\<name\>`, `\*`).
const LITERAL_TEXT = /(`+)([\s\S]*?[^`])\1(?!`)|\\([!-/:-@[-`{-~])/g;
const HELD_TEXT = /\uE000(\d+)\uE001/g;
const TAG_NAME = /^<\/?([A-Za-z][\w.:-]*)/;

/**
 * What a tag leaves in plain text: a space for one that separates words (a
 * block element, `<br>`, `<hr>`, or an MDX component such as `<Callout>`),
 * nothing for an inline one (`<kbd>`, `<em>`), a comment, or an autolink.
 */
const tagText = (tag: string): string => {
	const name = tag.match(TAG_NAME)?.[1];
	if (!name) return "";
	const lower = name.toLowerCase();
	return /^[A-Z]/.test(name) ||
		BLOCK_ELEMENTS.has(lower) ||
		lower === "br" ||
		lower === "hr"
		? " "
		: "";
};

/**
 * Markdown as plain text, for search entries and page descriptions. Code
 * spans keep their text without the backticks, escaped characters keep
 * their character (`\<name\>` is `<name>`), an image keeps its alt text,
 * underscores inside a word (`snake_case`) are not read as emphasis, and
 * HTML tags are left out, a space kept where one separates words.
 */
export const stripMarkdown = (value: string) => {
	const literal: string[] = [];
	// Code and escapes are set aside first, so no other rule reaches into them.
	const held = value
		.replace(/[\uE000\uE001]/g, "")
		.replace(
			LITERAL_TEXT,
			(_, _ticks?: string, code?: string, escaped?: string) => {
				// As CommonMark reads a code span: one space off each end when both have one.
				const text =
					code === undefined
						? (escaped as string)
						: /^ [\s\S]*[^ ][\s\S]* $/.test(code)
							? code.slice(1, -1)
							: code;
				literal.push(text);
				return `\uE000${literal.length - 1}\uE001`;
			},
		);
	// A link's destination may hold balanced parentheses: `(/wiki/Foo_(bar))`.
	return held
		.replace(/!?\[(.*?)\]\((?:[^()]|\([^()]*\))*\)/g, "$1")
		.replace(/\*\*(.*?)\*\*/g, "$1")
		.replace(/\*(.*?)\*/g, "$1")
		.replace(
			/(^|[^\p{L}\p{N}_])_{1,3}([^_]+?)_{1,3}(?![\p{L}\p{N}_])/gu,
			"$1$2",
		)
		.replace(/~~(.*?)~~/g, "$1")
		.replace(/<[^>]+>/g, tagText)
		.replace(/^\s*[-*+]\s+/g, "")
		.replace(/^\s*\d+\.\s+/g, "")
		.replace(HELD_TEXT, (_, index: string) => literal[Number(index)])
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

/** A run of prose or fenced code; `line` is the 0-based line it starts on. */
export type MarkdownSegment = { code: boolean; text: string; line: number };

/**
 * A line that opens fenced code: three or more backticks (with no backtick
 * in the info string after them) or tildes. MDX has no indented code, so a
 * fence may be indented any amount, as one in a third-level list item is.
 */
export const FENCE_OPENING = /^([ \t]*)(`{3,}(?=[^`]*$)|~{3,})/;
/** A line that can close fenced code: the fence, and nothing after it but spaces. */
const FENCE_CLOSING = /^[ \t]*(`{3,}|~{3,})[ \t]*$/;
const INLINE_CODE = /(`+)[\s\S]*?\1/g;
const HTML_COMMENT = /<!--([\s\S]*?)-->/g;
const HTML_TAG =
	/<(\/?)([A-Za-z][A-Za-z0-9-]*)((?:\s+[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g;
const HTML_ATTRIBUTE =
	/([^\s"'<>/=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g;

/**
 * Splits Markdown into runs of prose and fenced code, in order. Code runs
 * to a closing fence of the same character, at least as long as the one
 * that opened it, or to the end.
 */
export const splitFencedCode = (markdown: string): MarkdownSegment[] => {
	const segments: MarkdownSegment[] = [];
	let current: MarkdownSegment | null = null;
	let fence: string | null = null;
	markdown.split("\n").forEach((line, index) => {
		const opening = fence ? undefined : line.match(FENCE_OPENING)?.[2];
		const opens = opening !== undefined;
		const code = Boolean(fence) || opens;
		if (opening !== undefined) fence = opening;
		else if (fence) {
			const closing = line.match(FENCE_CLOSING)?.[1];
			if (
				closing &&
				closing[0] === fence[0] &&
				closing.length >= fence.length
			) {
				fence = null;
			}
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

/** A change to source text: `start..end` becomes `text`. */
type Edit = { start: number; end: number; text: string };

/** What `findUnsafeMarkup` finds, by kind. */
type MarkupKind =
	| {
			/** A Markdown link, reference, or definition to an address `isSafeLink` refuses. */
			kind: "link";
			/** The address, decoded. */
			href: string;
	  }
	| {
			/** An attribute of a kept element, or a component's prop. */
			kind: "attribute";
			/** Lower case for an HTML element; a component's name as written. */
			element: string;
			/** Lower case for an HTML element; `{...}` for a spread. */
			attribute: string;
			/** Its value, decoded; an expression or a spread as written, braces included. */
			value: string;
			/** Whether the value is an expression or a spread, which the build cannot read. */
			expression: boolean;
			refusal: AttributeRefusal;
	  }
	| {
			/** An element the site leaves out (`elementVerdict`), or an `<iframe>` with no `src`. */
			kind: "element";
			/** Lower case. */
			element: string;
			/** What the site keeps of it: what it holds, or nothing. */
			keeps: "contents" | "nothing";
	  }
	| {
			/** An MDX expression (`{…}`) that is not a comment or a plain literal, or an `import`/`export` block. */
			kind: "expression" | "code";
			/** As written. */
			source: string;
	  };

type Found = {
	/** Where it is in the source: the link, definition, attribute, tag, expression, or block. */
	start: number;
	end: number;
	/** What changes in the source to leave it out. */
	edits: Edit[];
} & MarkupKind;

/**
 * Something in Markdown or MDX source the site does not keep (see
 * `html-allowlist.ts` and `isSafeLink`), where it is, and what takes its
 * place: a link's words, an element's content, or nothing.
 */
export type UnsafeMarkup = Found & {
	/** 1-based line in the source. */
	line: number;
};

/** What a report lists of something left out: what it is, and its line. */
export type UnsafeMarkupEntry = MarkupKind & { line: number };

/** The entry a report lists for `found`, its line moved down by `linesBefore` (the lines above the text it was found in). */
export const markupEntry = (
	{ start: _start, end: _end, edits: _edits, ...entry }: UnsafeMarkup,
	linesBefore = 0,
): UnsafeMarkupEntry => ({ ...entry, line: linesBefore + entry.line });

export type FindUnsafeMarkupOptions = {
	/**
	 * How tags read: `jsx` (the default, for MDX), where a capitalized name
	 * is a component, braces hold expressions, and every tag is a JSX
	 * element; or `html`, for Markdown notes, where `<IFRAME SRC>` is an
	 * element, as HTML reads it, braces are text, and a tag that is not a
	 * kept or hidden element stays as written (import shows it as text),
	 * losing only an unsafe address.
	 */
	tags?: "jsx" | "html";
};

/** Code, HTML comments, and MDX comments blanked out, keeping every offset. */
const maskNonProse = (markdown: string): string =>
	splitFencedCode(markdown)
		.map(({ code, text }) =>
			code
				? text.replace(/[^\n]/g, " ")
				: text.replace(
						/(`+)[\s\S]*?\1|<!--[\s\S]*?-->|\{\/\*[\s\S]*?\*\/\}/g,
						(span) => span.replace(/[^\n]/g, " "),
					),
		)
		.join("\n");

/** A Markdown link destination as CommonMark reads it: escapes and character references decoded. */
const readDestination = (raw: string): string =>
	decodeEntities(
		(raw.startsWith("<") ? raw.slice(1, -1) : raw).replace(
			/\\([!-/:-@[-`{-~])/g,
			"$1",
		),
	);

/** A reference label as CommonMark matches it: case and runs of spaces ignored. */
export const normalizeLabel = (label: string): string =>
	label.trim().replace(/\s+/g, " ").toLowerCase();

/** The index of the `[` that opens the bracket closing at `close`, or -1. */
const openingBracket = (text: string, close: number): number => {
	let depth = 0;
	for (let index = close; index >= 0; index -= 1) {
		if (text[index - 1] === "\\") continue;
		if (text[index] === "]") depth += 1;
		else if (text[index] === "[" && --depth === 0) return index;
		else if (text[index] === "\n" && text[index - 1] === "\n") return -1;
	}
	return -1;
};

/**
 * Where an inline link's `(destination "title")` that opens at `open` ends,
 * and its destination; null when it is not one.
 */
const inlineDestination = (
	text: string,
	open: number,
): { raw: string; end: number } | null => {
	const rest = text.slice(open + 1);
	const match = rest.match(
		/^[ \t]*\n?[ \t]*(<[^<>\n]*>|(?:[^\s()\\]|\\.|\((?:[^\s()\\]|\\.)*\))*)(?:[ \t]*\n?[ \t]*(?:"[^"]*"|'[^']*'|\([^()]*\)))?[ \t]*\n?[ \t]*\)/,
	);
	return match ? { raw: match[1], end: open + 1 + match[0].length } : null;
};

// `[label]: destination` at the start of a line; `[^1]:` is a footnote.
const DEFINITION =
	/^ {0,3}\[(?!\^)((?:[^\]\\\n]|\\.)+)\]:[ \t]*(<[^<>\n]*>|\S+)[^\n]*(?:\n|$)/gm;
// `[text][label]`, `[label][]`, or `[label]`, not followed by `(` or `:`.
const REFERENCE =
	/(?<![!\]\\])\[((?:[^\]\\\n]|\\.)+)\](?:\[((?:[^\]\\\n]|\\.)*)\])?(?![(:[])/g;
/** A spread attribute in MDX (`{...props}`, `{...{ src: "…" }}`), braces nested up to three deep, as a pattern. */
export const SPREAD = String.raw`\{\s*\.\.\.(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}`;

/** Markdown links, references, and definitions to addresses `isSafeLink` refuses. */
const unsafeMarkdownLinks = (markdown: string, masked: string): Found[] => {
	const found: Found[] = [];
	const link = (start: number, end: number, text: string, href: string) =>
		found.push({
			kind: "link",
			start,
			end,
			href,
			edits: [{ start, end, text }],
		});

	// The address each unsafe definition's label stands for.
	const unsafeLabels = new Map<string, string>();
	for (const match of masked.matchAll(DEFINITION)) {
		const href = readDestination(match[2]);
		if (isSafeLink(href)) continue;
		unsafeLabels.set(normalizeLabel(match[1]), href);
		const start = match.index ?? 0;
		link(start, start + match[0].length, "", href);
	}

	for (const match of masked.matchAll(/\]\(/g)) {
		const close = match.index ?? 0;
		const open = openingBracket(masked, close);
		if (open < 0 || masked[open - 1] === "!") continue;
		const destination = inlineDestination(masked, close + 1);
		if (!destination) continue;
		const href = readDestination(destination.raw);
		if (isSafeLink(href)) continue;
		link(open, destination.end, markdown.slice(open + 1, close), href);
	}

	if (unsafeLabels.size > 0) {
		for (const match of masked.matchAll(REFERENCE)) {
			const href = unsafeLabels.get(normalizeLabel(match[2] || match[1]));
			if (href === undefined) continue;
			const start = match.index ?? 0;
			link(
				start,
				start + match[0].length,
				markdown.slice(start + 1, start + 1 + match[1].length),
				href,
			);
		}
	}
	return found;
};

/**
 * The index of the `}` that closes the `{` at `open`, past strings,
 * template literals, comments, and nested braces, as an MDX expression
 * reads them; -1 when it never closes.
 */
const closingBrace = (text: string, open: number): number => {
	const stack = ["}"];
	for (let index = open + 1; index < text.length; index += 1) {
		const char = text[index];
		const inTemplate = stack[stack.length - 1] === "`";
		if (inTemplate) {
			if (char === "\\") index += 1;
			else if (char === "`") stack.pop();
			else if (char === "$" && text[index + 1] === "{") {
				stack.push("}");
				index += 1;
			}
			continue;
		}
		if (char === '"' || char === "'") {
			let at = index + 1;
			while (at < text.length && text[at] !== char) {
				if (text[at] === "\\") at += 1;
				at += 1;
			}
			if (at >= text.length) return -1;
			index = at;
		} else if (char === "`") {
			stack.push("`");
		} else if (char === "/" && text[index + 1] === "*") {
			const end = text.indexOf("*/", index + 2);
			if (end < 0) return -1;
			index = end + 1;
		} else if (char === "/" && text[index + 1] === "/") {
			const end = text.indexOf("\n", index);
			if (end < 0) return -1;
			index = end;
		} else if (char === "{") {
			stack.push("}");
		} else if (char === "}") {
			stack.pop();
			if (stack.length === 0) return index;
		}
	}
	return -1;
};

/** An attribute in a tag: its name (null for a spread), and its value. */
type TagAttribute = {
	/** From the space before it to its end, so removing it leaves the tag tidy. */
	start: number;
	end: number;
	name: string | null;
	/** Decoded text; "" for a bare name; null for an expression that is not a plain literal, or a spread. */
	value: string | null;
	/** An expression's or a spread's source, braces included. */
	source?: string;
};

type Tag = {
	start: number;
	end: number;
	/** As written; "" for a JSX fragment (`<>`). */
	name: string;
	closing: boolean;
	selfClosing: boolean;
	attributes: TagAttribute[];
};

const JSX_NAME = /[A-Za-z_$][\w$-]*(?:[.:][A-Za-z_$][\w$-]*)*/y;
const HTML_NAME = /[A-Za-z][A-Za-z0-9-]*/y;
const SPACE = /\s*/y;
const JSX_ATTRIBUTE_NAME = /[^\s"'<>/={}]+/y;
const HTML_ATTRIBUTE_NAME = /[^\s"'<>/=]+/y;
const UNQUOTED_VALUE = /[^\s"'=<>`]+/y;

/** Matches `pattern` (sticky) at `at`, or null. */
const stickyMatch = (pattern: RegExp, text: string, at: number) => {
	pattern.lastIndex = at;
	return pattern.exec(text)?.[0] ?? null;
};

/**
 * The tag that starts at the `<` at `at`, as MDX reads one (`jsx`: names
 * with `.` and `:`, quoted or braced values, spreads, fragments) or as HTML
 * does (unquoted values, no braces); null when it is not a tag.
 */
const readTag = (text: string, at: number, jsx: boolean): Tag | null => {
	let index = at + 1;
	const closing = text[index] === "/";
	if (closing) index += 1;
	const name = stickyMatch(jsx ? JSX_NAME : HTML_NAME, text, index) ?? "";
	if (!name && !(jsx && text[index] === ">")) return null;
	index += name.length;
	const attributes: TagAttribute[] = [];
	for (;;) {
		const start = index;
		index += stickyMatch(SPACE, text, index)?.length ?? 0;
		if (text[index] === ">" || text.startsWith("/>", index)) {
			const selfClosing = text[index] === "/";
			if (closing && (attributes.length > 0 || selfClosing)) return null;
			return {
				start: at,
				end: index + (selfClosing ? 2 : 1),
				name,
				closing,
				selfClosing,
				attributes,
			};
		}
		if (index === start || closing) return null;
		if (jsx && text[index] === "{") {
			const end = closingBrace(text, index);
			const source = end < 0 ? "" : text.slice(index, end + 1);
			if (!/^\{\s*\.\.\./.test(source)) return null;
			attributes.push({ start, end: end + 1, name: null, value: null, source });
			index = end + 1;
			continue;
		}
		const attribute = stickyMatch(
			jsx ? JSX_ATTRIBUTE_NAME : HTML_ATTRIBUTE_NAME,
			text,
			index,
		);
		if (!attribute) return null;
		index += attribute.length;
		const beforeEquals = index;
		index += stickyMatch(SPACE, text, index)?.length ?? 0;
		if (text[index] !== "=") {
			index = beforeEquals;
			attributes.push({ start, end: index, name: attribute, value: "" });
			continue;
		}
		index += 1;
		index += stickyMatch(SPACE, text, index)?.length ?? 0;
		const quote = text[index];
		if (quote === '"' || quote === "'") {
			const end = text.indexOf(quote, index + 1);
			if (end < 0) return null;
			attributes.push({
				start,
				end: end + 1,
				name: attribute,
				value: decodeEntities(text.slice(index + 1, end)),
			});
			index = end + 1;
		} else if (jsx && quote === "{") {
			const end = closingBrace(text, index);
			if (end < 0) return null;
			const source = text.slice(index, end + 1);
			attributes.push({
				start,
				end: end + 1,
				name: attribute,
				value: literalValue(source.slice(1, -1)),
				source,
			});
			index = end + 1;
		} else {
			const bare = jsx ? null : stickyMatch(UNQUOTED_VALUE, text, index);
			if (!bare) return null;
			attributes.push({
				start,
				end: index + bare.length,
				name: attribute,
				value: decodeEntities(bare),
			});
			index += bare.length;
		}
	}
};

/** An `import` or `export` line opening a block of MDX, which the build would run as code. */
const ESM_BLOCK =
	/(?<=^|\n[ \t]*\n)(?:import|export)(?=[\s{*])[\s\S]*?(?=\n[ \t]*\n|$)/g;

/**
 * Raw HTML, MDX expressions, and code the allowlist does not keep
 * (`html-allowlist.ts`): elements left out, attributes removed (an unsafe
 * address among them), and, in MDX, expressions and `import`/`export`
 * blocks. `holds` gets, for each finding that leaves out a whole region
 * (an element and what it holds, an expression, a block), that region;
 * `wraps`, for each element left out keeping what it holds, its extent.
 */
const unsafeHtml = (
	masked: string,
	jsx: boolean,
	holds: Map<Found, Edit>,
	wraps: Map<Found, Edit>,
): Found[] => {
	const found: Found[] = [];
	const remove = (start: number, end: number): Edit => ({
		start,
		end,
		text: "",
	});
	const leaveOut = (each: Found, region: Edit) => {
		found.push(each);
		holds.set(each, region);
	};

	const tags: Tag[] = [];
	for (let index = 0; index < masked.length; index += 1) {
		const char = masked[index];
		if (char === "\\") {
			index += 1;
		} else if (char === "<") {
			const tag = readTag(masked, index, jsx);
			if (!tag) continue;
			tags.push(tag);
			index = tag.end - 1;
		} else if (jsx && char === "{") {
			const end = closingBrace(masked, index);
			if (end < 0) continue;
			const source = masked.slice(index, end + 1);
			const inner = source.slice(1, -1);
			if (!isCommentExpression(inner) && literalValue(inner) === null) {
				const region = remove(index, end + 1);
				leaveOut(
					{
						kind: "expression",
						start: index,
						end: end + 1,
						source,
						edits: [region],
					},
					region,
				);
			}
			index = end;
		}
	}
	if (jsx) {
		for (const match of masked.matchAll(ESM_BLOCK)) {
			const start = match.index ?? 0;
			const end = start + match[0].length;
			const region = remove(start, end);
			leaveOut(
				{ kind: "code", start, end, source: match[0], edits: [region] },
				region,
			);
		}
	}

	// Each opening tag's closing tag, as the source nests them.
	const closes = new Map<Tag, Tag>();
	const open: Tag[] = [];
	const key = (tag: Tag) => (jsx ? tag.name : tag.name.toLowerCase());
	for (const tag of tags) {
		if (tag.selfClosing) continue;
		if (!tag.closing) {
			if (jsx || !VOID_ELEMENTS.has(tag.name.toLowerCase())) open.push(tag);
			continue;
		}
		const at = open.map(key).lastIndexOf(key(tag));
		if (at < 0) continue;
		closes.set(open[at], tag);
		open.length = at;
	}

	for (const tag of tags) {
		if (tag.closing || !tag.name) continue;
		const close = closes.get(tag);
		const whole = remove(tag.start, close?.end ?? tag.end);
		const unwrap = [
			remove(tag.start, tag.end),
			...(close ? [remove(close.start, close.end)] : []),
		];
		const component = jsx && !/^[a-z]/.test(tag.name);
		const element = component ? tag.name : tag.name.toLowerCase();
		/** An attribute that goes: by itself, or with `edits` (its link's tags). */
		const refuse = (
			{ start, end, name, value, source }: TagAttribute,
			refusal: AttributeRefusal,
			edits: Edit[] = [remove(start, end)],
		) =>
			found.push({
				kind: "attribute",
				start,
				end,
				element,
				attribute:
					name === null ? "{...}" : component ? name : name.toLowerCase(),
				value: value ?? source ?? "",
				expression: value === null,
				refusal,
				edits,
			});

		if (component) {
			// Its props are its own, but for these.
			for (const each of tag.attributes) {
				const refusal =
					each.name === null
						? "spread"
						: componentPropRefusal(each.name, each.value);
				if (refusal) refuse(each, refusal);
			}
			continue;
		}

		const verdict = elementVerdict(element);
		if (verdict === "drop") {
			leaveOut(
				{
					kind: "element",
					start: tag.start,
					end: tag.end,
					element,
					keeps: "nothing",
					edits: [whole],
				},
				whole,
			);
			continue;
		}
		if (verdict === "unwrap" && jsx) {
			const each: Found = {
				kind: "element",
				start: tag.start,
				end: tag.end,
				element,
				keeps: "contents",
				edits: unwrap,
			};
			found.push(each);
			wraps.set(each, whole);
			continue;
		}
		if (verdict === "unwrap") {
			// A note's tag that import shows as text: only an unsafe address goes.
			for (const each of tag.attributes) {
				if (
					each.name !== null &&
					isAddressAttribute(element, each.name) &&
					!isSafeLink(each.value ?? "")
				) {
					refuse(each, "address");
				}
			}
			continue;
		}

		// A kept element loses the attributes it may not carry. A link whose
		// address goes becomes its words. An embed whose source goes, or that
		// has none, goes too, named by its source, or else by the first
		// attribute it may not carry.
		let source = false;
		const first = found.length;
		for (const each of tag.attributes) {
			const name = each.name?.toLowerCase();
			const refusal =
				each.name === null
					? "spread"
					: attributeRefusal(element, each.name, each.value);
			if (!refusal) {
				source ||= name === "src" && Boolean(each.value?.trim());
			} else if (element === "a" && name === "href") {
				refuse(each, refusal, unwrap);
			} else {
				refuse(each, refusal);
			}
		}
		if (element === "iframe" && !source) {
			const refused = found.slice(first);
			const named =
				refused.find(
					(each) => each.kind === "attribute" && each.attribute === "src",
				) ?? refused[0];
			if (named) {
				named.edits = [whole];
				holds.set(named, whole);
			} else {
				leaveOut(
					{
						kind: "element",
						start: tag.start,
						end: tag.end,
						element,
						keeps: "nothing",
						edits: [whole],
					},
					whole,
				);
			}
		}
	}
	return found;
};

/**
 * What the site leaves out of Markdown or MDX source, in source order: links
 * to addresses `isSafeLink` refuses (inline, references, and their
 * definitions), and raw HTML the allowlist does not keep (`html-allowlist.ts`):
 * elements, attributes, and, in MDX, expressions and `import`/`export`
 * blocks. Code and comments are not read. Something inside what is left
 * out whole (an element and what it holds, an expression) is not listed,
 * nor is an element left out keeping what it holds inside another (the
 * parts of an `<svg>`). A scan, not a parse: the build applies the same
 * allowlist to the parsed page whatever this finds.
 */
export const findUnsafeMarkup = (
	markdown: string,
	options: FindUnsafeMarkupOptions = {},
): UnsafeMarkup[] => {
	const masked = maskNonProse(markdown);
	const lineAt = (index: number) => markdown.slice(0, index).split("\n").length;
	const holds = new Map<Found, Edit>();
	const wraps = new Map<Found, Edit>();
	const found = [
		...unsafeMarkdownLinks(markdown, masked),
		...unsafeHtml(masked, options.tags !== "html", holds, wraps),
	];
	const within = (each: Found, regions: Map<Found, Edit>) =>
		[...regions].some(
			([owner, region]) =>
				owner !== each && region.start <= each.start && each.end <= region.end,
		);
	const inside = (each: Found) =>
		within(each, holds) ||
		(each.kind === "element" &&
			each.keeps === "contents" &&
			within(each, wraps));
	return found
		.filter((each) => !inside(each))
		.sort((a, b) => a.start - b.start || b.end - a.end)
		.map((each) => ({ ...each, line: lineAt(each.start) }));
};

/** `text` with `edits` made; an edit inside another, or overlapping one made before it, is skipped. */
const applyEdits = (text: string, edits: readonly Edit[]): string => {
	const chosen: Edit[] = [];
	for (const edit of [...edits].sort(
		(a, b) => a.start - b.start || b.end - a.end,
	)) {
		const last = chosen[chosen.length - 1];
		if (last && edit.start < last.end) continue;
		chosen.push(edit);
	}
	return chosen.reduceRight(
		(out, edit) => out.slice(0, edit.start) + edit.text + out.slice(edit.end),
		text,
	);
};

/**
 * `markdown` with everything `findUnsafeMarkup` finds left out: a link
 * becomes its words, an element what it holds or nothing, and an attribute,
 * expression, or code block goes. Repeated until nothing is left to find,
 * so what leaving one thing out joins up (`<scr<script></script>ipt>`) is
 * found too.
 */
export const withoutUnsafeMarkup = (
	markdown: string,
	options: FindUnsafeMarkupOptions = {},
): string => {
	let text = markdown;
	for (let pass = 0; pass < 10; pass += 1) {
		const found = findUnsafeMarkup(text, options);
		if (found.length === 0) break;
		const next = applyEdits(
			text,
			found.flatMap((each) => each.edits),
		);
		if (next === text) break;
		text = next;
	}
	return text;
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
	const embedded = EMBEDDED_ELEMENTS.has(name);
	if (!KEPT_ELEMENTS.has(name) && !embedded) return null;
	if (closing) return rawAttributes.trim() ? null : `</${name}>`;
	const attributes: string[] = [];
	let source = false;
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
		source ||= key.toLowerCase() === "src" && Boolean(text.trim());
		if (value === undefined) attributes.push(key);
		else if (/^["']/.test(value)) attributes.push(`${key}=${value}`);
		else attributes.push(`${key}="${value}"`);
	}
	if (embedded && !source) return null;
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
