export type ExportChapter = {
  slug: string;
  title: string;
  body: string;
  description?: string;
  locale?: string;
};

export type ExportBundle = {
  title: string;
  version?: string;
  updatedAt?: string;
  chapters: ExportChapter[];
};

export type ExportFormat = "pdf" | "epub";

export type ExportMetadata = {
  format: ExportFormat;
  sizeBytes: number;
  updatedAt: string;
  scope: "book" | "chapter";
  slug?: string;
};

export type ExportLink = {
  label: string;
  href: string;
  format: ExportFormat;
  size?: string;
  updatedAt?: string;
  scope?: "book" | "chapter";
  slug?: string;
};

export type ExportLinkOptions = {
  bundle: ExportBundle;
  scope: "book" | "chapter";
  slug?: string;
  title?: string;
  basePath?: string;
  formats?: ExportFormat[];
};

export type BookExportInfo = {
  title: string;
  version?: string;
  updatedAt?: string;
};

export type BookExportHelperOptions = {
  book: BookExportInfo;
  modules: Record<string, string>;
  basePath?: string;
  formats?: ExportFormat[];
};
