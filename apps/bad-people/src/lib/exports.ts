import {
  createBookExportHelpers,
} from "@bookkit/astro-bookkit/exports";
import bookConfig from "../book.config";

const chapterModules = import.meta.glob<string>("../content/book/chapters/*.mdx", {
  eager: true,
  as: "raw",
});

const exportHelpers = createBookExportHelpers({
  book: {
    title: bookConfig.title,
    version: bookConfig.status,
  },
  modules: chapterModules,
});

export const {
  getBookExportBundle,
  getChapterExportBundle,
  getBookExportLinks,
  getChapterExportLinks,
} = exportHelpers;
