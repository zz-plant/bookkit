/**
 * Which links a book keeps: one rule for the site's pages, the PDF and EPUB,
 * the GitBook export, import, and the content checks. A link that would run
 * code or open a document it carries (`javascript:`, `vbscript:`, `data:`)
 * keeps its words and loses its address. Which attributes hold an address,
 * and the rest of what raw HTML may hold, is `html-allowlist.ts`.
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
 * breaks anywhere ignored, so `java\tscript:` is `javascript`. A leading
 * U+FFFD counts as a control character: MDX and `decodeEntities` turn a
 * reference to one (`&#1;javascript:`) into it, where a browser reading the
 * HTML keeps the control character and skips it. Null for a link without
 * one (`#x`, `/read/…`, `notes.md`).
 */
export const linkScheme = (href: string): string | null =>
	href
		.replace(/[\t\n\r]/g, "")
		// biome-ignore lint/suspicious/noControlCharactersInRegex: a browser skips these before the scheme
		.replace(/^(?:[\u0000- ]|\uFFFD)+/, "")
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
