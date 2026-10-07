import { stripMarkdown } from "../utils/markdown";
import type { BookSeoConfig } from "./config";

/**
 * What a search result shows for one page: its title and description. Search
 * engines cut titles near 60 characters and descriptions near 160, so the
 * page's own name leads and the book's short title follows.
 */

/** The short title: the text before the first colon, as the running head shows it. */
export const shortBookTitle = (bookTitle: string): string =>
	bookTitle.split(/:\s+/)[0]?.trim() || bookTitle;

/** A page's `<title>`: its own name, then the book's short title. */
export const bookPageTitle = (
	pageTitle: string | undefined | null,
	bookTitle: string,
): string => {
	const book = shortBookTitle(bookTitle);
	const page = pageTitle?.trim();
	if (!page || page === book) return book;
	return `${page} • ${book}`;
};

export const META_DESCRIPTION_MAX_CHARACTERS = 160;

/** Plain one-line text, cut at a word boundary, for a meta description. */
export const toMetaDescription = (
	text: string | undefined | null,
	max = META_DESCRIPTION_MAX_CHARACTERS,
): string | undefined => {
	if (typeof text !== "string") return undefined;
	const plain = stripMarkdown(text).replace(/\s+/g, " ").trim();
	if (!plain) return undefined;
	if (plain.length <= max) return plain;
	const cut = plain.slice(0, max - 1);
	const lastSpace = cut.lastIndexOf(" ");
	const atWord = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
	return `${atWord.replace(/[\s,;:.–—-]+$/u, "")}…`;
};

/** The first candidate that makes a usable description. */
export const firstMetaDescription = (
	...candidates: Array<string | undefined | null>
): string | undefined => {
	for (const candidate of candidates) {
		const description = toMetaDescription(candidate);
		if (description) return description;
	}
	return undefined;
};

/** Chapters with fewer body words are outlines or stubs; see `site.minIndexableWords`. */
export const DEFAULT_MIN_INDEXABLE_WORDS = 60;

/**
 * Whether a chapter is too thin to offer to search engines. `wordCount` comes
 * from `extractPageFacts`; without it a page is never treated as thin.
 */
export const isThinPage = (
	wordCount: unknown,
	site?: BookSeoConfig,
): boolean => {
	const minimum = site?.minIndexableWords ?? DEFAULT_MIN_INDEXABLE_WORDS;
	return typeof wordCount === "number" && minimum > 0 && wordCount < minimum;
};

/** robots value for a page kept out of search while its links are still followed. */
export const THIN_PAGE_ROBOTS = "noindex, follow";
