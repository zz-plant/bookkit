import {
  buildExportChapters,
  buildExportMetadata,
  formatBytes,
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

const formatUpdatedDate = (updatedAt: string) => updatedAt.slice(0, 10);

export const getBookExportLinks = () => {
  const bundle = getBookExportBundle();
  const pdfMeta = buildExportMetadata(bundle, "pdf", "book");
  const epubMeta = buildExportMetadata(bundle, "epub", "book");
  const updatedAt = formatUpdatedDate(bundle.updatedAt ?? new Date().toISOString());

  return [
    {
      label: "Full book export",
      href: "/exports/book.pdf",
      format: "pdf" as const,
      size: formatBytes(pdfMeta.sizeBytes),
      updatedAt,
      scope: "book" as const,
    },
    {
      label: "Full book export",
      href: "/exports/book.epub",
      format: "epub" as const,
      size: formatBytes(epubMeta.sizeBytes),
      updatedAt,
      scope: "book" as const,
    },
  ];
};

export const getChapterExportLinks = (slug: string, title: string) => {
  const bundle = getChapterExportBundle(slug);
  if (!bundle) return [];
  const pdfMeta = buildExportMetadata(bundle, "pdf", "chapter", slug);
  const epubMeta = buildExportMetadata(bundle, "epub", "chapter", slug);
  const updatedAt = formatUpdatedDate(bundle.updatedAt ?? new Date().toISOString());

  return [
    {
      label: `${title} export`,
      href: `/exports/chapters/${slug}.pdf`,
      format: "pdf" as const,
      size: formatBytes(pdfMeta.sizeBytes),
      updatedAt,
      scope: "chapter" as const,
      slug,
    },
    {
      label: `${title} export`,
      href: `/exports/chapters/${slug}.epub`,
      format: "epub" as const,
      size: formatBytes(epubMeta.sizeBytes),
      updatedAt,
      scope: "chapter" as const,
      slug,
    },
  ];
};
