import { createBookExportHelpersFromConfig } from "@bookkit/astro-bookkit";
import bookConfig from "../book.config";

const chapterModules = import.meta.glob<string>("../content/book/chapters/*.mdx", {
  eager: true,
  as: "raw",
});

const exportHelpers = createBookExportHelpersFromConfig({
  bookConfig,
  modules: chapterModules,
});

export const {
  getBookExportBundle,
  getChapterExportBundle,
  getBookExportLinks,
  getChapterExportLinks,
} = exportHelpers;
