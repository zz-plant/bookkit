import { buildExportChapters } from "./content-parsing";
import { createEpubExport } from "./epub-generator";
import { createPdfExport } from "./pdf-generator";
import type { BookExportHelperOptions, ExportBundle, ExportChapter, ExportFormat, ExportLink, ExportLinkOptions, ExportMetadata } from "./types";

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};

export const formatExportUpdatedDate = (updatedAt: string): string => updatedAt.slice(0, 10);

export const estimateExportBytes = (chapters: ExportChapter[], format: ExportFormat): number => {
  const textLength = chapters.reduce((total, chapter) => total + chapter.body.length, 0);
  const base = format === "pdf" ? 48_000 : 24_000;
  const multiplier = format === "pdf" ? 2.4 : 1.4;
  return Math.round(base + textLength * multiplier);
};

export const createExportResponse = async (bundle: ExportBundle, format: ExportFormat, filename: string): Promise<Response> => {
  const updatedAt = bundle.updatedAt ?? new Date().toISOString();
  const resolved = { ...bundle, updatedAt };
  const bytes = format === "pdf" ? await createPdfExport(resolved) : await createEpubExport(resolved);
  return new Response(Uint8Array.from(bytes), {
    headers: {
      "Content-Type": format === "pdf" ? "application/pdf" : "application/epub+zip",
      "Content-Disposition": `attachment; filename=\"${filename}\"`,
      "Cache-Control": "public, max-age=86400",
    },
  });
};

export const buildExportMetadata = (bundle: ExportBundle, format: ExportFormat, scope: "book" | "chapter", slug?: string): ExportMetadata => ({
  format,
  sizeBytes: estimateExportBytes(bundle.chapters, format),
  updatedAt: bundle.updatedAt ?? new Date().toISOString(),
  scope,
  slug,
});

export const buildExportLinks = ({ bundle, scope, slug, title, basePath = "/exports", formats = ["pdf", "epub"] }: ExportLinkOptions): ExportLink[] => {
  if (scope === "chapter" && !slug) return [];
  const normalizedBase = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
  const updatedAt = formatExportUpdatedDate(bundle.updatedAt ?? new Date().toISOString());
  const label = scope === "book" ? "Full book" : (title ?? "Chapter");
  return formats.map((format) => {
    const meta = buildExportMetadata(bundle, format, scope, slug);
    const href = scope === "book" ? `${normalizedBase}/book.${format}` : `${normalizedBase}/chapters/${slug}.${format}`;
    return { label, href, format, size: formatBytes(meta.sizeBytes), updatedAt, scope, slug };
  });
};

export const createBookExportHelpers = ({ book, modules, basePath, formats }: BookExportHelperOptions) => {
  const chapters = buildExportChapters(modules);
  const updatedAt = book.updatedAt ?? new Date().toISOString();
  const buildBundle = (subset: ExportChapter[]): ExportBundle => ({
    title: book.title,
    version: book.version,
    updatedAt,
    chapters: subset,
  });

  const getBookExportBundle = () => buildBundle(chapters);
  const getChapterExportBundle = (slug: string): ExportBundle | null => {
    const chapter = chapters.find((item) => item.slug === slug);
    return chapter ? buildBundle([chapter]) : null;
  };

  return {
    getBookExportBundle,
    getChapterExportBundle,
    getBookExportLinks: () => buildExportLinks({ bundle: getBookExportBundle(), scope: "book", basePath, formats }),
    getChapterExportLinks: (slug: string, title: string) => {
      const bundle = getChapterExportBundle(slug);
      return bundle ? buildExportLinks({ bundle, scope: "chapter", slug, title, basePath, formats }) : [];
    },
  };
};
