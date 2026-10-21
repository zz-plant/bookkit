import { isPageSlug } from "../schemas/slug";

/**
 * The chapter a page's path names, as reader analytics records it:
 * `/read/chapters/<slug>` gives the slug. Any other page, and a segment that
 * is not a slug (a mistyped address, which the 404 page answers), gives
 * null, so the reader script sends only what the endpoint accepts.
 */
export const chapterSlugOfPath = (pathname: string): string | null => {
	const [section, kind, slug] = pathname.split("/").filter(Boolean);
	return section === "read" && kind === "chapters" && slug && isPageSlug(slug)
		? slug
		: null;
};
