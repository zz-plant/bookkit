import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createBookMcpEndpointFromWorkspace } from "../mcp";
import { createReleaseEmailEndpoint } from "../releases/endpoint";
import type { ReleaseModule, ReleaseNote } from "../releases/notes";
import { getOgImageForPath } from "./og";
import {
  createAnalyticsApiHandlers,
  createBookExportGetHandler,
  createChapterExportHandlers,
  createExportAnalyticsApiHandlers,
  createFeedbackApiHandlers,
  createPreviewAnalyticsApiHandlers,
  createReleaseAnalyticsApiPostHandler,
  createReleaseWebhookApiHandlers,
} from "../app-wrappers";
import { createBookExportHelpersFromConfig } from "./exports";
import {
  createBookEntryPointsFromModules,
  createChapterExportSlugs,
  createReleaseNoteHelpers,
  type BookEntrypointModules,
} from "./app-helpers";
import type { BookVersionEntryOptions } from "./releases";

type BookRuntimeConfig = {
  slug: string;
  title: string;
  status?: string;
  site?: {
    defaultMeta?: {
      description?: string;
    };
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
  const releaseHelpers = createReleaseNoteHelpers(bookEntryPoints.releaseModules, releaseNotes);
  const exportHelpers = createBookExportHelpersFromConfig({
    bookConfig,
    modules: bookEntryPoints.contentRawModules.chapters,
  });
  const chapterExportSlugs = createChapterExportSlugs(bookEntryPoints.contentModules.chapters);

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
    api: {
      analytics: createAnalyticsApiHandlers(),
      feedback: createFeedbackApiHandlers(),
      exportAnalytics: createExportAnalyticsApiHandlers(),
      previewAnalytics: createPreviewAnalyticsApiHandlers(),
      releaseAnalytics: {
        POST: createReleaseAnalyticsApiPostHandler(),
      },
      releaseWebhook: createReleaseWebhookApiHandlers({
        modules: releaseHelpers.releaseModules,
        book: { slug: bookConfig.slug, title: bookConfig.title },
      }),
      releaseEmail: createReleaseEmailEndpoint({
        modules: releaseHelpers.releaseModules,
        book: { slug: bookConfig.slug, title: bookConfig.title },
      }),
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
            getBookExportBundle: exportHelpers.getBookExportBundle,
            format: "pdf",
            filename: `${bookConfig.slug}.pdf`,
          }),
        },
        epub: {
          GET: createBookExportGetHandler({
            getBookExportBundle: exportHelpers.getBookExportBundle,
            format: "epub",
            filename: `${bookConfig.slug}.epub`,
          }),
        },
      },
      chapters: {
        pdf: createChapterExportHandlers({
          chapterExportSlugs,
          getChapterExportBundle: exportHelpers.getChapterExportBundle,
          format: "pdf",
          filenamePrefix: bookConfig.slug,
        }),
        epub: createChapterExportHandlers({
          chapterExportSlugs,
          getChapterExportBundle: exportHelpers.getChapterExportBundle,
          format: "epub",
          filenamePrefix: bookConfig.slug,
        }),
      },
    },
  };
};

export type BookRuntime = ReturnType<typeof createBookRuntime>;
export type { BookRuntimeConfig, BookEntrypointModules, ReleaseModule, ReleaseNote };
