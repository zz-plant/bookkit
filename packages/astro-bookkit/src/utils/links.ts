/**
 * Which links a book keeps: one rule for the site's pages, the PDF and EPUB,
 * import, and the content checks. A link that would run code or open a
 * document it carries (`javascript:`, `vbscript:`, `data:`) keeps its words
 * and loses its address.
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

/**
 * The string a JSX expression is when it is only a plain string literal
 * (`{"https://…"}`, `{'…'}`, a template with no `${}`), with no escapes; null
 * for any other expression, whose value the build cannot check.
 */
export const stringLiteralValue = (expression: string): string | null =>
	expression.trim().match(/^(["'`])([^"'`\\$]*)\1$/)?.[2] ?? null;
