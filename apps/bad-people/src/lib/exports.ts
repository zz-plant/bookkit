import { createBookExportHelpersFromConfig } from "@bookkit/astro-bookkit";
import bookConfig from "../book.config";
import { bookEntryPoints } from "./book-entrypoints";

const exportHelpers = createBookExportHelpersFromConfig({
  bookConfig,
  modules: bookEntryPoints.contentRawModules.chapters,
});

const chapterModules = Object.values(bookEntryPoints.contentModules.chapters ?? {}) as Array<{
  frontmatter?: {
    slug?: string;
  };
}>;

export const chapterExportSlugs = chapterModules
  .map((module) => module.frontmatter?.slug)
  .filter((slug): slug is string => typeof slug === "string" && slug.length > 0);

export const {
  getBookExportBundle,
  getChapterExportBundle,
  getBookExportLinks,
  getChapterExportLinks,
} = exportHelpers;
