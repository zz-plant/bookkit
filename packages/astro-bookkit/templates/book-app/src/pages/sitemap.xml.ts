import type { BookSitemapContentModules } from "@bookkit/astro-bookkit";
import {
	createSitemapGetHandler,
	resolveBookSite,
} from "@bookkit/astro-bookkit";

import bookConfig from "../book.config";
import { bookEntryPoints } from "../lib/book-entrypoints";
import { getReleaseNotes } from "../lib/release-notes";

export const GET = createSitemapGetHandler({
	site: resolveBookSite(bookConfig),
	content: bookEntryPoints.contentModules as BookSitemapContentModules,
	contentRaw: bookEntryPoints.contentRawModules,
	defaultLastmod: getReleaseNotes()[0]?.date,
	defaultLocale: bookConfig.localization?.defaultLocale,
});
