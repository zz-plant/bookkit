import {
  buildExportChapters,
  buildExportLinks,
  type ExportBundle,
  type ExportChapter,
} from "@bookkit/astro-bookkit/exports";
import bookConfig from "../book.config";

const chapterModules = import.meta.glob<string>("../content/book/chapters/*.mdx", {
  eager: true,
  as: "raw",
});

const buildBundle = (chapters: ExportChapter[]): ExportBundle => ({
  title: bookConfig.title,
  version: bookConfig.status,
  updatedAt: new Date().toISOString(),
  chapters,
});

export const getBookExportBundle = (): ExportBundle => {
  const chapters = buildExportChapters(chapterModules);
  return buildBundle(chapters);
};

export const getChapterExportBundle = (slug: string): ExportBundle | null => {
  const chapters = buildExportChapters(chapterModules);
  const chapter = chapters.find((item) => item.slug === slug);
  if (!chapter) return null;
  return buildBundle([chapter]);
};

export const getBookExportLinks = () => {
  const bundle = getBookExportBundle();
  return buildExportLinks({ bundle, scope: "book" });
};

export const getChapterExportLinks = (slug: string, title: string) => {
  const bundle = getChapterExportBundle(slug);
  if (!bundle) return [];
  return buildExportLinks({ bundle, scope: "chapter", slug, title });
};
