import type { BookRuntime } from "./runtime";

export const createBookAppShims = (bookRuntime: BookRuntime) => ({
  bookEntryPoints: bookRuntime.bookEntryPoints,
  releaseModules: bookRuntime.releaseModules,
  getReleaseNotes: bookRuntime.getReleaseNotes,
  getVersionEntries: bookRuntime.getVersionEntries,
  getOgImageForPath: bookRuntime.getOgImageForPath,
  chapterExportSlugs: bookRuntime.chapterExportSlugs,
  getBookExportBundle: bookRuntime.getBookExportBundle,
  getChapterExportBundle: bookRuntime.getChapterExportBundle,
  getBookExportLinks: bookRuntime.getBookExportLinks,
  getChapterExportLinks: bookRuntime.getChapterExportLinks,
  analyticsApiHandlers: bookRuntime.api.analytics,
  exportAnalyticsApiHandlers: bookRuntime.api.exportAnalytics,
  feedbackApiHandlers: bookRuntime.api.feedback,
  previewAnalyticsApiHandlers: bookRuntime.api.previewAnalytics,
  releaseAnalyticsApiHandlers: bookRuntime.api.releaseAnalytics,
  releaseWebhookApiHandlers: bookRuntime.api.releaseWebhook,
  releaseEmailApiHandlers: bookRuntime.api.releaseEmail,
  createMcpApiHandlers: bookRuntime.api.createMcpHandlersFromModuleUrl,
  bookPdfExportRoute: bookRuntime.exportRoutes.book.pdf,
  bookEpubExportRoute: bookRuntime.exportRoutes.book.epub,
  chapterPdfExportRoute: bookRuntime.exportRoutes.chapters.pdf,
  chapterEpubExportRoute: bookRuntime.exportRoutes.chapters.epub,
});

export type BookAppShims = ReturnType<typeof createBookAppShims>;
