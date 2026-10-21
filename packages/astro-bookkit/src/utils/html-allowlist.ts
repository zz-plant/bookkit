import { isSafeLink, SAFE_SCHEME_LIST } from "./links";

/**
 * The raw HTML a book's content may hold, defined once for the site's pages
 * (the Markdown-tree step in `markdown/safe-html.ts`), `bookkit check`,
 * import, the PDF, EPUB, and GitBook exports, the search index, and
 * check:build's EPUB check.
 *
 * Content is written by authors, but also imported from notes and proposed
 * by agents, so it is treated as untrusted. It may lay out and mark up text,
 * link, show images, and embed a page from the web; nothing in it runs
 * script, styles the page, or collects what a reader types.
 *
 * - **Elements** (`elementVerdict`): those Markdown writes and those import
 *   keeps are kept (`CONTENT_ELEMENTS`). Code, styling, and document
 *   metadata (`HIDDEN_ELEMENTS`) are left out with everything inside them.
 *   Any other element (a form, a button, an `<svg>`, a `<video>`) is left
 *   out and what it holds kept, each part checked in turn.
 * - **Attributes** of a kept element (`attributeRefusal`): a few any element
 *   may carry, and a few more per element. An address keeps the link rule
 *   (`isSafeLink`). Event handlers, `style`, `srcdoc`, Astro's `set:html`,
 *   and anything else unlisted are removed. In MDX, a value written as an
 *   expression that is not a plain string, and a spread (`{...props}`),
 *   cannot be checked when the book is built, so they are removed too.
 * - **Links** (`markdown/safe-html.ts`): an `<a>` whose address is removed
 *   becomes its words, as a Markdown link does; an `<iframe>` with no safe
 *   `src` is left out; and a link that opens a new window gets
 *   `rel="noopener"`.
 *
 * MDX components (capitalized tags) are the engine's own, and are kept;
 * their props follow the same rule for `set:html`, expressions, and spreads.
 */

/** Void elements: they never have content or a closing tag. */
export const VOID_ELEMENTS: ReadonlySet<string> = new Set([
	"br",
	"col",
	"hr",
	"img",
	"source",
	"wbr",
]);

/** Elements that start a block of their own. */
export const BLOCK_ELEMENTS: ReadonlySet<string> = new Set([
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

/**
 * Elements import keeps from a note as HTML (`toMdxBody`'s `html: "jsx"`):
 * presentational HTML that Markdown notes use. The PDF and EPUB render the
 * same set.
 */
export const KEPT_ELEMENTS: ReadonlySet<string> = new Set([
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

/**
 * Embedded pages import keeps too, when they have a `src`: a video or a map
 * (`<iframe src="https://www.youtube.com/embed/…">`). The site shows them;
 * the PDF and EPUB, which cannot, show a link to the page instead.
 */
export const EMBEDDED_ELEMENTS: ReadonlySet<string> = new Set(["iframe"]);

/**
 * What the engine's Markdown writes: paragraphs, headings, lists, quotes,
 * code, emphasis, links, images, tables, and footnotes (a `<section>` and
 * `<sup>`). A task list's checkbox is Markdown's own `<input>`; raw HTML may
 * not write one.
 */
const MARKDOWN_ELEMENTS = [
	"a",
	"blockquote",
	"br",
	"code",
	"del",
	"em",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"hr",
	"img",
	"li",
	"ol",
	"p",
	"pre",
	"section",
	"strong",
	"sup",
	"table",
	"tbody",
	"td",
	"th",
	"thead",
	"tr",
	"ul",
];

/** The elements raw HTML in content may use. */
export const CONTENT_ELEMENTS: ReadonlySet<string> = new Set([
	...MARKDOWN_ELEMENTS,
	...KEPT_ELEMENTS,
	...EMBEDDED_ELEMENTS,
]);

/**
 * Elements whose content is code, styling, or document metadata, never
 * text a reader reads: left out with everything inside them.
 */
export const HIDDEN_ELEMENTS: ReadonlySet<string> = new Set([
	"base",
	"head",
	"link",
	"meta",
	"noscript",
	"script",
	"style",
	"template",
	"title",
]);

/** What becomes of an element: kept, left out with what it holds (`drop`), or left out keeping what it holds (`unwrap`). */
export type ElementVerdict = "keep" | "drop" | "unwrap";

/**
 * What becomes of an HTML element in content, by name in any case
 * (`<sCRIPT>` is a script). A name with a namespace is left out as its
 * local name would be (`<svg:script>` with what it holds), and never kept.
 */
export const elementVerdict = (element: string): ElementVerdict => {
	const name = element.toLowerCase();
	if (CONTENT_ELEMENTS.has(name)) return "keep";
	const local = name.slice(name.lastIndexOf(":") + 1);
	return HIDDEN_ELEMENTS.has(local) ? "drop" : "unwrap";
};

/** Attributes any kept element may carry, besides `aria-*`. */
const GLOBAL_ATTRIBUTES = ["id", "class", "title", "lang", "dir", "role"];

/**
 * `align`, obsolete in HTML but common in notes written for GitHub: the
 * blocks the PDF and EPUB honor it on, headings, images, and tables.
 */
const ALIGNED = [
	"article",
	"aside",
	"blockquote",
	"caption",
	"center",
	"col",
	"colgroup",
	"div",
	"figure",
	"footer",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"header",
	"img",
	"p",
	"section",
	"table",
	"tbody",
	"td",
	"tfoot",
	"th",
	"thead",
	"tr",
];

const CELL = ["colspan", "rowspan", "headers", "width"];

/** Attributes each kept element may carry, besides the global ones. */
const ELEMENT_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
	a: ["href", "rel", "target", "hreflang"],
	blockquote: ["cite"],
	col: ["span", "width"],
	colgroup: ["span", "width"],
	del: ["cite", "datetime"],
	details: ["open"],
	// `frameborder` is in the snippets YouTube and Vimeo hand out.
	iframe: [
		"src",
		"width",
		"height",
		"allow",
		"allowfullscreen",
		"loading",
		"referrerpolicy",
		"frameborder",
	],
	img: [
		"src",
		"srcset",
		"sizes",
		"alt",
		"width",
		"height",
		"loading",
		"decoding",
	],
	ins: ["cite", "datetime"],
	li: ["value"],
	ol: ["start", "reversed", "type"],
	q: ["cite"],
	source: ["srcset", "sizes", "media", "type", "width", "height"],
	table: ["width"],
	td: CELL,
	th: [...CELL, "scope", "abbr"],
	time: ["datetime"],
};

/** Whether a kept element may carry an attribute (both lower case). */
const isListed = (element: string, attribute: string): boolean =>
	GLOBAL_ATTRIBUTES.includes(attribute) ||
	attribute.startsWith("aria-") ||
	(attribute === "align" && ALIGNED.includes(element)) ||
	(ELEMENT_ATTRIBUTES[element]?.includes(attribute) ?? false);

/** The attributes `element` may carry, for a message: its own, then the global ones. */
export const listedAttributes = (element: string): string[] => [
	...(ELEMENT_ATTRIBUTES[element.toLowerCase()] ?? []),
	...(ALIGNED.includes(element.toLowerCase()) ? ["align"] : []),
	...GLOBAL_ATTRIBUTES,
	"aria-*",
];

/** Addresses on any element: a link's, SVG's older `xlink:href`, and a button's form address. */
const ADDRESS_ON_ANY = new Set(["href", "xlink:href", "formaction"]);

/** Attributes holding the address of what an element embeds, quotes, or submits to. */
const ADDRESS_ON: Readonly<Record<string, string>> = {
	blockquote: "cite",
	del: "cite",
	embed: "src",
	form: "action",
	iframe: "src",
	ins: "cite",
	object: "data",
	q: "cite",
};

/**
 * Whether an attribute holds an address `isSafeLink` rules on: `href`,
 * `xlink:href`, and `formaction` anywhere, an embedded document's
 * `<iframe src>`, `<embed src>`, or `<object data>`, a `<form action>`, and
 * a quote's `cite`. An `<iframe>` with a `javascript:` source runs it, as a
 * link does when followed. An image's `src` is not one: an image keeps a
 * `data:` source.
 */
export const isAddressAttribute = (
	element: string,
	attribute: string,
): boolean => {
	const name = attribute.toLowerCase();
	return ADDRESS_ON_ANY.has(name) || ADDRESS_ON[element.toLowerCase()] === name;
};

/**
 * What an `<iframe allow>` may grant the page it embeds: what video, audio,
 * and map embeds ask for. A page granted the camera or the microphone asks
 * the reader for it in the book's name.
 */
const EMBED_PERMISSIONS: ReadonlySet<string> = new Set([
	"accelerometer",
	"autoplay",
	"clipboard-write",
	"encrypted-media",
	"fullscreen",
	"gyroscope",
	"picture-in-picture",
	"web-share",
]);

/** The features an `allow` value grants that an embed does not need. */
export const extraPermissions = (allow: string): string[] =>
	allow
		.split(";")
		.map((directive) => directive.trim().split(/\s+/)[0].toLowerCase())
		.filter((feature) => feature && !EMBED_PERMISSIONS.has(feature));

/** Why content may not keep an attribute. */
export type AttributeRefusal =
	/** `on…`: runs script. */
	| "handler"
	/** Inline `style`. */
	| "style"
	/** `<iframe srcdoc>`: a whole document, which runs with the page's rights. */
	| "document"
	/** Astro's `set:html`, which writes its value into the page as HTML. */
	| "raw-html"
	/** An address `isSafeLink` refuses, or one written as an expression. */
	| "address"
	/** An `<iframe allow>` granting more than an embed needs. */
	| "permission"
	/** A value written as an expression that is not a plain string. */
	| "expression"
	/** `{...props}`. */
	| "spread"
	/** Not one the element may carry. */
	| "unlisted";

/**
 * Why content may not keep this attribute of a kept element, or null when
 * it may: `value` has its character references decoded, and is null for an
 * expression the build cannot read (`title={name}`). Names are compared in
 * lower case, as HTML reads them (`onError`, `colSpan`); `className` is
 * `class`, as Astro writes it.
 */
export const attributeRefusal = (
	element: string,
	attribute: string,
	value: string | null,
): AttributeRefusal | null => {
	const tag = element.toLowerCase();
	const name =
		attribute.toLowerCase() === "classname" ? "class" : attribute.toLowerCase();
	if (name.startsWith("on")) return "handler";
	if (name === "style") return "style";
	if (name === "set:html") return "raw-html";
	if (tag === "iframe" && name === "srcdoc") return "document";
	const address = isAddressAttribute(tag, name);
	if (address && (value === null || !isSafeLink(value))) return "address";
	if (!isListed(tag, name)) return "unlisted";
	if (address) return null;
	if (value === null) return "expression";
	if (tag === "iframe" && name === "allow" && extraPermissions(value).length) {
		return "permission";
	}
	return null;
};

/**
 * Why a component's prop goes: Astro's `set:html`, an expression that is
 * not a plain string, or a spread. Its other props are the component's own.
 */
export const componentPropRefusal = (
	prop: string,
	value: string | null,
): AttributeRefusal | null =>
	prop === "set:html" ? "raw-html" : value === null ? "expression" : null;

/** A `target` that opens a new window, which gets `rel="noopener"`: any but `_self`, `_parent`, and `_top`. */
export const opensNewWindow = (target: string): boolean =>
	!/^(?:_self|_parent|_top|)$/i.test(target.trim());

/** A `rel` value with `noopener` in it, and without `opener`, which would undo it. */
export const withNoopener = (rel: string): string => {
	const tokens = rel
		.split(/\s+/)
		.filter((token) => token && !/^(?:opener|noopener)$/i.test(token));
	return [...tokens, "noopener"].join(" ");
};

/**
 * What a JSX expression is when it is a plain literal: a string with no
 * escapes (`{"https://…"}`, `{'…'}`, a template with no `${}`), or a number
 * (`{2}`); null for any other expression, whose value the build cannot
 * check.
 */
export const literalValue = (expression: string): string | null => {
	const trimmed = expression.trim();
	if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return trimmed;
	return trimmed.match(/^(["'`])([^"'`\\$]*)\1$/)?.[2] ?? null;
};

/** Whether an MDX expression holds only comments, as `{/* … *\/}` does. */
export const isCommentExpression = (expression: string): boolean =>
	!expression
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/\/\/[^\n]*/g, "")
		.trim();

/**
 * A title for an embed that has none, from the page it shows: "YouTube
 * video", "Vimeo video", "Google Maps map", or "Embedded page from
 * example.com". A frame needs a title to be named to a screen reader.
 */
export const embedTitle = (src: string): string => {
	let host = "";
	try {
		host = new URL(src, "https://book.invalid").hostname.replace(/^www\./, "");
	} catch {
		// Not an address this can read; named for what it is.
	}
	if (/(^|\.)(youtube(-nocookie)?\.com|youtu\.be)$/.test(host)) {
		return "YouTube video";
	}
	if (/(^|\.)vimeo\.com$/.test(host)) return "Vimeo video";
	if (/^google\.[a-z.]+$/.test(host) && /\/maps\b/.test(src)) {
		return "Google Maps map";
	}
	return host && host !== "book.invalid"
		? `Embedded page from ${host}`
		: "Embedded page";
};

/** Why an element goes, for a message: "content runs no script". */
export const elementReason = (element: string): string => {
	const name = element.toLowerCase();
	if (name === "style" || name === "link") {
		return "a book's pages take their styling from its stylesheet";
	}
	if (["base", "head", "meta", "title"].includes(name)) {
		return "it describes a whole document, which the page already does";
	}
	if (HIDDEN_ELEMENTS.has(name)) return "a book's content runs no script";
	if (
		[
			"button",
			"datalist",
			"fieldset",
			"form",
			"input",
			"label",
			"legend",
			"optgroup",
			"option",
			"output",
			"select",
			"textarea",
		].includes(name)
	) {
		return "a book's content collects nothing a reader types";
	}
	if (name === "svg" || name === "math") {
		return `an inline <${name}> can run script and load addresses`;
	}
	return `<${name}> is not an element a book's content keeps`;
};

/** Why an attribute goes, for a message: "an event handler runs script". */
export const refusalReason = (
	refusal: AttributeRefusal,
	element: string,
	attribute: string,
	value: string | null,
): string => {
	switch (refusal) {
		case "handler":
			return "an event handler runs script, and a book's content runs none";
		case "style":
			return "inline style can restyle or cover the page, which takes its styling from the book's stylesheet";
		case "document":
			return "it holds a document whose script would run with the page's own rights";
		case "raw-html":
			return "it writes its value into the page as HTML the build cannot check";
		case "address":
			return value === null
				? "its address is an expression, which the build cannot check"
				: `a book links only to ${SAFE_SCHEME_LIST} addresses and to its own pages`;
		case "permission":
			return `it lets the embedded page ask for ${extraPermissions(value ?? "").join(", ")}, which an embed in a book does not need`;
		case "expression":
			return "its value is an expression, which the build cannot check";
		case "spread":
			return "a spread's attributes cannot be checked when the book is built";
		case "unlisted":
			return attribute.toLowerCase().startsWith("data-")
				? "the reader UI finds its own parts by data-* attributes, so content carries none"
				: `<${element.toLowerCase()}> keeps only ${listedAttributes(element).join(", ")}`;
	}
};
