import type { BookSitemapContentModules } from "@bookkit/astro-bookkit";
import { createSitemapGetHandler } from "@bookkit/astro-bookkit";

import bookConfig from "../book.config";
import { bookEntryPoints } from "../lib/book-entrypoints";
import { getReleaseNotes } from "../lib/release-notes";

export const GET = createSitemapGetHandler({
	site: bookConfig.site,
	content: bookEntryPoints.contentModules as BookSitemapContentModules,
	defaultLastmod: getReleaseNotes()[0]?.date,
});
