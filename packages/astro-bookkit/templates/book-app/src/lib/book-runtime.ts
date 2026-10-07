import {
	type ChapterModule,
	createBookAppShims,
	createBookRuntime,
	type ExampleModule,
	type GlossaryModule,
	type MechanismModule,
	type ToolkitModule,
} from "@bookkit/astro-bookkit";

import bookConfig from "../book.config";

export const bookRuntime = createBookRuntime({
	bookConfig,
	modules: {
		contentModules: {
			chapters: import.meta.glob<ChapterModule>("../content/book/chapters/*.mdx", {
				eager: true,
			}),
			mechanisms: import.meta.glob<MechanismModule>("../content/book/mechanisms/*.mdx", {
				eager: true,
			}),
			toolkit: import.meta.glob<ToolkitModule>("../content/book/toolkit/*.mdx", {
				eager: true,
			}),
			glossary: import.meta.glob<GlossaryModule>("../content/book/glossary/*.mdx", {
				eager: true,
			}),
			examples: import.meta.glob<ExampleModule>("../content/book/examples/**/*.mdx", {
				eager: true,
			}),
		},
		contentRawModules: {
			chapters: import.meta.glob<string>("../content/book/chapters/*.mdx", {
				eager: true,
				query: "?raw",
				import: "default",
			}),
			mechanisms: import.meta.glob<string>("../content/book/mechanisms/*.mdx", {
				eager: true,
				query: "?raw",
				import: "default",
			}),
			toolkit: import.meta.glob<string>("../content/book/toolkit/*.mdx", {
				eager: true,
				query: "?raw",
				import: "default",
			}),
			glossary: import.meta.glob<string>("../content/book/glossary/*.mdx", {
				eager: true,
				query: "?raw",
				import: "default",
			}),
			examples: import.meta.glob<string>("../content/book/examples/**/*.mdx", {
				eager: true,
				query: "?raw",
				import: "default",
			}),
		},
		releaseModules: import.meta.glob("../content/book/releases/*.mdx", {
			eager: true,
		}),
	},
	releaseNotes: {
		latestLabel: "Latest",
	},
});

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

export const analyticsApiGet = analyticsApiHandlers.GET;
export const analyticsApiPost = analyticsApiHandlers.POST;
export const exportAnalyticsApiPost = exportAnalyticsApiHandlers.POST;
export const feedbackApiPost = feedbackApiHandlers.POST;
export const previewAnalyticsApiGet = previewAnalyticsApiHandlers.GET;
export const previewAnalyticsApiPost = previewAnalyticsApiHandlers.POST;
export const releaseAnalyticsApiPost = releaseAnalyticsApiHandlers.POST;
export const releaseWebhookApiPost = releaseWebhookApiHandlers.POST;
export const releaseEmailApiPost = releaseEmailApiHandlers.POST;
export const bookPdfExportGet = bookPdfExportRoute.GET;
export const bookEpubExportGet = bookEpubExportRoute.GET;
export const chapterPdfExportGet = chapterPdfExportRoute.GET;
export const chapterPdfExportStaticPaths = chapterPdfExportRoute.getStaticPaths;
export const chapterEpubExportGet = chapterEpubExportRoute.GET;
export const chapterEpubExportStaticPaths =
	chapterEpubExportRoute.getStaticPaths;
