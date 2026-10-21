import { bookConfig, modules } from "virtual:bookkit/book";
import { createBookAppShims, createBookRuntime } from "../book";

/**
 * The book's runtime, built once from what `virtual:bookkit/book` reads out
 * of the book app (its book.config.ts and content; see `integration.ts`).
 * Every injected route reads the book through this module, and so can a page
 * a book keeps in its own src/pages/.
 */
export const bookRuntime = createBookRuntime({
	bookConfig,
	modules,
	releaseNotes: {
		latestLabel: "Latest",
	},
});

export { bookConfig };

export const {
	bookEntryPoints,
	releaseModules,
	getReleaseNotes,
	getVersionEntries,
	getOgImageForPath,
	chapterExportSlugs,
	getBookExportBundle,
	getChapterExportBundle,
	getBookExportLinks,
	getChapterExportLinks,
	analyticsApiHandlers,
	exportAnalyticsApiHandlers,
	feedbackApiHandlers,
	previewAnalyticsApiHandlers,
	releaseAnalyticsApiHandlers,
	releaseWebhookApiHandlers,
	releaseEmailApiHandlers,
	qaApiHandlers,
	createMcpApiHandlers,
	bookPdfExportRoute,
	bookEpubExportRoute,
	chapterPdfExportRoute,
	chapterEpubExportRoute,
} = createBookAppShims(bookRuntime);

export const bookPdfExportGet = bookPdfExportRoute.GET;
export const bookEpubExportGet = bookEpubExportRoute.GET;
export const chapterPdfExportGet = chapterPdfExportRoute.GET;
export const chapterPdfExportStaticPaths = chapterPdfExportRoute.getStaticPaths;
export const chapterEpubExportGet = chapterEpubExportRoute.GET;
export const chapterEpubExportStaticPaths =
	chapterEpubExportRoute.getStaticPaths;
