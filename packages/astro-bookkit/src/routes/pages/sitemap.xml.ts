import { createSitemapGetHandler } from "../../app-wrappers";
import type { BookSitemapContentModules } from "../../seo/book";
import { resolveBookSite } from "../../seo/config";
import { bookConfig, bookEntryPoints, getReleaseNotes } from "../runtime";

export const GET = createSitemapGetHandler({
	site: resolveBookSite(bookConfig),
	content: bookEntryPoints.contentModules as BookSitemapContentModules,
	contentRaw: bookEntryPoints.contentRawModules,
	defaultLastmod: getReleaseNotes()[0]?.date,
	defaultLocale: bookConfig.localization?.defaultLocale,
});
