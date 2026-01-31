import { createBookExportHelpersFromConfig } from "@bookkit/astro-bookkit";
import bookConfig from "../book.config";
import { bookEntryPoints } from "./book-entrypoints";

const exportHelpers = createBookExportHelpersFromConfig({
  bookConfig,
  modules: bookEntryPoints.contentRawModules.chapters,
});

export const {
  getBookExportBundle,
  getChapterExportBundle,
  getBookExportLinks,
  getChapterExportLinks,
} = exportHelpers;
