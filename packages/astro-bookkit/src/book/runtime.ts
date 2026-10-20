import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
	createAnalyticsApiHandlers,
	createBookExportGetHandler,
	createChapterExportHandlers,
	createExportAnalyticsApiHandlers,
	createFeedbackApiHandlers,
	createPreviewAnalyticsApiHandlers,
	createQaApiHandlers,
	createReleaseAnalyticsApiPostHandler,
	createReleaseWebhookApiHandlers,
} from "../app-wrappers";
import { createBookMcpEndpointFromWorkspace } from "../mcp";
import { createReleaseEmailEndpoint } from "../releases/endpoint";
import type { ReleaseModule, ReleaseNote } from "../releases/notes";
import { requestHandlers } from "../utils/http";
import {
	type BookEntrypointModules,
	createBookEntryPointsFromModules,
	createChapterExportSlugs,
	createReleaseNoteHelpers,
} from "./app-helpers";
import {
	type BookExportsConfig,
	createBookExportHelpersFromConfig,
} from "./exports";
import { getOgImageForPath } from "./og";
import type { BookVersionEntryOptions } from "./releases";

type BookRuntimeConfig = {
	slug: string;
	title: string;
	status?: string;
	author?: { name: string };
	site?: {
		url?: string;
		defaultMeta?: {
			description?: string;
		};
	};
	localization?: { defaultLocale?: string };
	mechanisms?: ReadonlyArray<{ slug: string }>;
	/** The PDF and EPUB downloads. */
	exports?: BookExportsConfig;
	features?: {
		aiQa?: boolean;
		aiQaProvider?: import("../qa").AiQaProviderConfig;
		aiQaProviders?: import("../qa").AiQaProviderConfig[];
	};
};

export type CreateBookRuntimeOptions = {
	bookConfig: BookRuntimeConfig;
	modules: BookEntrypointModules;
	releaseNotes?: BookVersionEntryOptions;
};

export const createBookRuntime = ({
	bookConfig,
	modules,
	releaseNotes,
}: CreateBookRuntimeOptions) => {
	const bookEntryPoints = createBookEntryPointsFromModules(modules);
	const releaseHelpers = createReleaseNoteHelpers(
		bookEntryPoints.releaseModules,
		releaseNotes,
	);
	// Exports carry every record type and describe the latest release.
	const exportHelpers = createBookExportHelpersFromConfig({
		bookConfig,
		release: releaseHelpers.getReleaseNotes()[0],
		modules: bookEntryPoints.contentRawModules,
	});
	const chapterExportSlugs = createChapterExportSlugs(
		bookEntryPoints.contentModules.chapters,
	);
	// A format the book turns off (`exports.pdf: false`) writes no files.
	const exportRoute = (format: "pdf" | "epub") => ({
		format,
		enabled: exportHelpers.formats.includes(format),
		render: exportHelpers.render,
	});

	return {
		bookConfig,
		bookEntryPoints,
		releaseModules: releaseHelpers.releaseModules,
		getReleaseNotes: releaseHelpers.getReleaseNotes,
		getVersionEntries: releaseHelpers.getVersionEntries,
		getOgImageForPath,
		chapterExportSlugs,
		getBookExportBundle: exportHelpers.getBookExportBundle,
		getChapterExportBundle: exportHelpers.getChapterExportBundle,
		getBookExportLinks: exportHelpers.getBookExportLinks,
		getChapterExportLinks: exportHelpers.getChapterExportLinks,
		// Everything but MCP needs a request handler; see `requestHandlers`.
		api: {
			analytics: requestHandlers(createAnalyticsApiHandlers()),
			feedback: requestHandlers(createFeedbackApiHandlers()),
			exportAnalytics: requestHandlers(createExportAnalyticsApiHandlers()),
			previewAnalytics: requestHandlers(createPreviewAnalyticsApiHandlers()),
			releaseAnalytics: requestHandlers({
				POST: createReleaseAnalyticsApiPostHandler(),
			}),
			releaseWebhook: requestHandlers(
				createReleaseWebhookApiHandlers({
					modules: releaseHelpers.releaseModules,
					book: { slug: bookConfig.slug, title: bookConfig.title },
				}),
			),
			releaseEmail: requestHandlers(
				createReleaseEmailEndpoint({
					modules: releaseHelpers.releaseModules,
					book: { slug: bookConfig.slug, title: bookConfig.title },
				}),
			),
			qa: requestHandlers(
				createQaApiHandlers({
					provider: bookConfig.features?.aiQaProvider,
					providers: bookConfig.features?.aiQaProviders,
				}),
			),
			createMcpHandlers: (startDir: string) =>
				createBookMcpEndpointFromWorkspace({
					startDir,
					bookTitle: bookConfig.title,
					bookSlug: bookConfig.slug,
					bookDescription: bookConfig.site?.defaultMeta?.description,
					contentRawModules: bookEntryPoints.contentRawModules,
				}),
			createMcpHandlersFromModuleUrl: (moduleUrl: string) =>
				createBookMcpEndpointFromWorkspace({
					startDir: dirname(fileURLToPath(moduleUrl)),
					bookTitle: bookConfig.title,
					bookSlug: bookConfig.slug,
					bookDescription: bookConfig.site?.defaultMeta?.description,
					contentRawModules: bookEntryPoints.contentRawModules,
				}),
		},
		exportRoutes: {
			book: {
				pdf: {
					GET: createBookExportGetHandler({
						...exportRoute("pdf"),
						getBookExportBundle: exportHelpers.getBookExportBundle,
						filename: `${bookConfig.slug}.pdf`,
					}),
				},
				epub: {
					GET: createBookExportGetHandler({
						...exportRoute("epub"),
						getBookExportBundle: exportHelpers.getBookExportBundle,
						filename: `${bookConfig.slug}.epub`,
					}),
				},
			},
			chapters: {
				pdf: createChapterExportHandlers({
					...exportRoute("pdf"),
					chapterExportSlugs,
					getChapterExportBundle: exportHelpers.getChapterExportBundle,
					filenamePrefix: bookConfig.slug,
				}),
				epub: createChapterExportHandlers({
					...exportRoute("epub"),
					chapterExportSlugs,
					getChapterExportBundle: exportHelpers.getChapterExportBundle,
					filenamePrefix: bookConfig.slug,
				}),
			},
		},
	};
};

export type BookRuntime = ReturnType<typeof createBookRuntime>;
export type {
	BookEntrypointModules,
	BookRuntimeConfig,
	ReleaseModule,
	ReleaseNote,
};
