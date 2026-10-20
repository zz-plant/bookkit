/**
 * Which links a book keeps: one rule for the site's pages, the PDF and EPUB,
 * the GitBook export, import, and the content checks. A link that would run
 * code or open a document it carries (`javascript:`, `vbscript:`, `data:`)
 * keeps its words and loses its address. So does an element that embeds a
 * document or submits a form to such an address (`isAddressAttribute`),
 * holds a document itself (`<iframe srcdoc>`), or animates an address
 * (`isUnsafeAttribute`). In MDX, an element whose attributes come from a
 * spread (`{...props}`) cannot be checked, so it goes too.
 */

/** A URL with a scheme (`https:`, `mailto:`), which no export rewrites. */
export const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** The schemes a book links to. A link with any other scheme keeps only its words. */
export const SAFE_LINK_SCHEMES: ReadonlySet<string> = new Set([
	"http",
	"https",
	"mailto",
	"tel",
	"ftp",
]);

/** "http, https, mailto, tel, and ftp", for messages. */
export const SAFE_SCHEME_LIST = [...SAFE_LINK_SCHEMES]
	.join(", ")
	.replace(/, (?=[^,]*$)/, ", and ");

/**
 * The scheme of a link, lower case, as a browser reads it: leading spaces
 * and control characters (U+0000 to U+0020) skipped, and tabs and line
 * breaks anywhere ignored, so `java\tscript:` is `javascript`. Null for a
 * link without one (`#x`, `/read/…`, `notes.md`).
 */
export const linkScheme = (href: string): string | null =>
	href
		.replace(/[\t\n\r]/g, "")
		// biome-ignore lint/suspicious/noControlCharactersInRegex: a browser skips these before the scheme
		.replace(/^[\u0000- ]+/, "")
		.match(HAS_SCHEME)?.[0]
		.slice(0, -1)
		.toLowerCase() ?? null;

/**
 * Whether a book may link to `href` (with its character references already
 * decoded): a link without a scheme, or one in `SAFE_LINK_SCHEMES`.
 * `javascript:`, `vbscript:`, `data:`, and `file:` links (any other scheme)
 * are not followed: their text stays, unlinked.
 */
export const isSafeLink = (href: string): boolean => {
	const scheme = linkScheme(href);
	return scheme === null || SAFE_LINK_SCHEMES.has(scheme);
};

/** Attributes holding an address the browser follows or loads, on any element; `xlink:href` is SVG's older `href`. */
const ADDRESS_ON_ANY = new Set(["href", "xlink:href", "formaction"]);

/** Attributes holding the address of a document an element embeds or submits to. */
const ADDRESS_ON: Readonly<Record<string, string>> = {
	iframe: "src",
	embed: "src",
	object: "data",
	form: "action",
};

/**
 * Whether an HTML element's attribute holds an address `isSafeLink` rules
 * on: `href`, `xlink:href`, and `formaction` on any element, an embedded
 * document's `<iframe src>`, `<embed src>`, and `<object data>`, and a
 * `<form action>`. An `<iframe>` with a `javascript:` source runs it, as a
 * link does when followed. An image's `src` is not one: an image keeps a
 * `data:` source. Names are compared in lower case, as HTML reads them
 * (`formAction`).
 */
const isAddressAttribute = (element: string, attribute: string): boolean => {
	const name = attribute.toLowerCase();
	return ADDRESS_ON_ANY.has(name) || ADDRESS_ON[element.toLowerCase()] === name;
};

/**
 * Whether an attribute holds a whole document rather than an address: an
 * `<iframe srcdoc>`, whose HTML runs with the page's own rights. No address
 * rule can vouch for one, so a book never keeps one.
 */
export const isDocumentAttribute = (
	element: string,
	attribute: string,
): boolean =>
	element.toLowerCase() === "iframe" && attribute.toLowerCase() === "srcdoc";

/**
 * Whether an attribute names what an SVG animation changes: with
 * `<animate attributeName="href">` or `<set attributeName="xlink:href">` a
 * link's `href` becomes `javascript:` after the page loads, past any check
 * of the link itself.
 */
const isAnimationTarget = (element: string, attribute: string): boolean =>
	/^(?:animate|set)$/i.test(element) &&
	attribute.toLowerCase() === "attributename";

/**
 * Whether a book may not keep this attribute of an HTML element, given its
 * value (character references decoded), or null for an expression
 * (`src={…}`) the build cannot read: an address `isSafeLink` refuses, any
 * `<iframe srcdoc>`, an animation of an address, and an address or an
 * animation's target written as such an expression.
 */
export const isUnsafeAttribute = (
	element: string,
	attribute: string,
	value: string | null,
): boolean => {
	if (isDocumentAttribute(element, attribute)) return true;
	if (isAddressAttribute(element, attribute)) {
		return value === null || !isSafeLink(value);
	}
	if (isAnimationTarget(element, attribute)) {
		return value === null || ADDRESS_ON_ANY.has(value.trim().toLowerCase());
	}
	return false;
};

/**
 * The string a JSX expression is when it is only a plain string literal
 * (`{"https://…"}`, `{'…'}`, a template with no `${}`), with no escapes; null
 * for any other expression, whose value the build cannot check.
 */
export const stringLiteralValue = (expression: string): string | null =>
	expression.trim().match(/^(["'`])([^"'`\\$]*)\1$/)?.[2] ?? null;
