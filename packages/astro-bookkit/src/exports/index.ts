import { randomUUID } from "crypto";
import JSZip from "jszip";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { createSlugger, stripMarkdown } from "../utils/markdown";

export type ExportChapter = {
  slug: string;
  title: string;
  body: string;
  description?: string;
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

const frontmatterPattern = /^---\n([\s\S]*?)\n---/;

const parseFrontmatter = (raw: string) => {
  const match = raw.match(frontmatterPattern);
  if (!match) return { data: {}, body: raw };
  const data: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const lineMatch = trimmed.match(/^(\w+):\s*(.*)$/);
    if (!lineMatch) continue;
    const key = lineMatch[1];
    let value = lineMatch[2].trim();
    value = value.replace(/^['"]|['"]$/g, "");
    data[key] = value;
  }
  const body = raw.slice(match[0].length).trim();
  return { data, body };
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const renderInline = (value: string) => {
  const escaped = escapeHtml(value);
  return escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
};

const markdownToHtml = (body: string, chapterSlugs?: string[]) => {
  const lines = body.split("\n");
  const slugger = createSlugger();
  const output: string[] = [];
  let listBuffer: string[] = [];
  let paragraphBuffer: string[] = [];

  const flushParagraph = () => {
    if (!paragraphBuffer.length) return;
    const text = paragraphBuffer.join(" ").trim();
    output.push(`<p>${renderInline(text)}</p>`);
    paragraphBuffer = [];
  };

  const flushList = () => {
    if (!listBuffer.length) return;
    output.push(`<ul>${listBuffer.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ul>`);
    listBuffer = [];
  };

  const rewriteLinks = (html: string) => {
    if (!chapterSlugs?.length) return html;
    return html.replace(/href=\"\/?read\/chapters\/([^\"#]+)(#[^\"]+)?\"/g, (match, slug, hash) => {
      if (!chapterSlugs.includes(slug)) return match;
      const anchor = hash ?? "";
      return `href=\"chapters/${slug}.xhtml${anchor}\"`;
    });
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = headingMatch[1].length;
      const text = headingMatch[2].replace(/#+\s*$/, "");
      const slug = slugger(stripMarkdown(text));
      output.push(`<h${level} id="${slug}">${renderInline(text)}</h${level}>`);
      continue;
    }

    const listMatch = trimmed.match(/^[-*+]\s+(.*)$/);
    if (listMatch) {
      flushParagraph();
      listBuffer.push(listMatch[1]);
      continue;
    }

    paragraphBuffer.push(trimmed);
  }

  flushParagraph();
  flushList();

  return rewriteLinks(output.join("\n"));
};

const buildChapterSlug = (path: string) => {
  return path.split("/").pop()?.replace(/\.mdx?$/, "") ?? "chapter";
};

export const buildExportChapters = (modules: Record<string, string>): ExportChapter[] => {
  return Object.entries(modules)
    .sort(([pathA], [pathB]) => pathA.localeCompare(pathB))
    .map(([path, raw]) => {
      const { data, body } = parseFrontmatter(raw);
      const slug = data.slug ?? buildChapterSlug(path);
      return {
        slug,
        title: data.title ?? slug,
        body,
        description: data.summary ?? data.description,
      };
    })
    .filter((chapter) => chapter.slug);
};

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
};

export const formatExportUpdatedDate = (updatedAt: string): string => updatedAt.slice(0, 10);

export const estimateExportBytes = (chapters: ExportChapter[], format: ExportFormat): number => {
  const textLength = chapters.reduce((total, chapter) => total + chapter.body.length, 0);
  const base = format === "pdf" ? 48_000 : 24_000;
  const multiplier = format === "pdf" ? 2.4 : 1.4;
  return Math.round(base + textLength * multiplier);
};

const buildCoverHtml = (bundle: ExportBundle) => {
  const updated = bundle.updatedAt ?? new Date().toISOString().slice(0, 10);
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
  <head>
    <title>${escapeHtml(bundle.title)}</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body class="cover">
    <section>
      <p class="cover__eyebrow">Exported ${escapeHtml(updated)}</p>
      <h1>${escapeHtml(bundle.title)}</h1>
      <p class="cover__meta">Version ${escapeHtml(bundle.version ?? "draft")}</p>
    </section>
  </body>
</html>`;
};

const buildChapterHtml = (chapter: ExportChapter, chapterSlugs?: string[]) => {
  const content = markdownToHtml(chapter.body, chapterSlugs);
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
  <head>
    <title>${escapeHtml(chapter.title)}</title>
    <link rel="stylesheet" href="../styles.css" />
  </head>
  <body>
    <article>
      <h1>${escapeHtml(chapter.title)}</h1>
      ${content}
    </article>
  </body>
</html>`;
};

export const createEpubExport = async (bundle: ExportBundle): Promise<Uint8Array> => {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

  const metaInf = zip.folder("META-INF");
  metaInf?.file(
    "container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>`
  );

  const oebps = zip.folder("OEBPS");
  const chaptersFolder = oebps?.folder("chapters");
  const chapterSlugs = bundle.chapters.map((chapter) => chapter.slug);

  const chapterItems = bundle.chapters.map((chapter) => {
    const filename = `${chapter.slug}.xhtml`;
    chaptersFolder?.file(filename, buildChapterHtml(chapter, chapterSlugs));
    return { id: `chap-${chapter.slug}`, href: `chapters/${filename}`, title: chapter.title };
  });

  oebps?.file("cover.xhtml", buildCoverHtml(bundle));
  oebps?.file(
    "styles.css",
    `body { font-family: "Georgia", serif; line-height: 1.6; color: #1b1b1b; }
.cover { display: flex; align-items: center; justify-content: center; height: 100vh; text-align: center; }
.cover__eyebrow { text-transform: uppercase; letter-spacing: 0.1em; font-size: 0.75rem; margin-bottom: 1rem; }
.cover__meta { color: #5a5a5a; }
article { max-width: 720px; margin: 0 auto; padding: 1.5rem 1.25rem; }
code { font-family: "Courier New", monospace; background: #f1f1f1; padding: 0.1rem 0.3rem; border-radius: 4px; }
`
  );

  const navItems = chapterItems
    .map((item) => `<li><a href="${item.href}">${escapeHtml(item.title)}</a></li>`)
    .join("");
  oebps?.file(
    "nav.xhtml",
    `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
  <head>
    <title>${escapeHtml(bundle.title)} contents</title>
  </head>
  <body>
    <nav epub:type="toc">
      <h2>Contents</h2>
      <ol>${navItems}</ol>
    </nav>
  </body>
</html>`
  );

  const identifier = `urn:uuid:${randomUUID()}`;
  const updated = bundle.updatedAt ?? new Date().toISOString();
  const manifestItems = [
    `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `<item id="css" href="styles.css" media-type="text/css"/>`,
    `<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>`,
    ...chapterItems.map(
      (item) => `<item id="${item.id}" href="${item.href}" media-type="application/xhtml+xml"/>`
    ),
  ].join("\n    ");

  const spineItems = [
    `<itemref idref="cover" />`,
    ...chapterItems.map((item) => `<itemref idref="${item.id}" />`),
  ].join("\n    ");

  oebps?.file(
    "content.opf",
    `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="book-id" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${identifier}</dc:identifier>
    <dc:title>${escapeHtml(bundle.title)}</dc:title>
    <dc:language>en</dc:language>
    <dc:date>${escapeHtml(updated)}</dc:date>
    <meta property="dcterms:modified">${escapeHtml(updated)}</meta>
  </metadata>
  <manifest>
    ${manifestItems}
  </manifest>
  <spine>
    ${spineItems}
  </spine>
</package>`
  );

  return zip.generateAsync({ type: "uint8array" });
};

const wrapText = (text: string, font: PDFFont, size: number, maxWidth: number): string[] => {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(next, size);
    if (width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
};

export const createPdfExport = async (bundle: ExportBundle): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 52;

  const addPageWithText = (lines: string[], options?: { title?: string }) => {
    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let cursorY = pageHeight - margin;

    if (options?.title) {
      page.drawText(options.title, {
        x: margin,
        y: cursorY,
        size: 22,
        font: fontBold,
        color: rgb(0.1, 0.1, 0.1),
      });
      cursorY -= 30;
    }

    const fontSize = 12;
    const lineHeight = fontSize * 1.5;
    for (const line of lines) {
      if (cursorY < margin + lineHeight) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        cursorY = pageHeight - margin;
      }
      page.drawText(line, {
        x: margin,
        y: cursorY,
        size: fontSize,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
      cursorY -= lineHeight;
    }
  };

  const updated = bundle.updatedAt ?? new Date().toISOString().slice(0, 10);
  const coverLines = wrapText(`Version ${bundle.version ?? "draft"} • ${updated}`, font, 14, pageWidth - margin * 2);
  addPageWithText(coverLines, { title: bundle.title });

  for (const chapter of bundle.chapters) {
    const body = stripMarkdown(chapter.body);
    const lines = wrapText(body, font, 12, pageWidth - margin * 2);
    addPageWithText(lines, { title: chapter.title });
  }

  return pdfDoc.save();
};

export const createExportResponse = async (
  bundle: ExportBundle,
  format: ExportFormat,
  filename: string
): Promise<Response> => {
  const updatedAt = bundle.updatedAt ?? new Date().toISOString();
  const resolved = { ...bundle, updatedAt };
  const bytes =
    format === "pdf" ? await createPdfExport(resolved) : await createEpubExport(resolved);
  return new Response(bytes, {
    headers: {
      "Content-Type": format === "pdf" ? "application/pdf" : "application/epub+zip",
      "Content-Disposition": `attachment; filename=\"${filename}\"`,
      "Cache-Control": "public, max-age=86400",
    },
  });
};

export const buildExportMetadata = (
  bundle: ExportBundle,
  format: ExportFormat,
  scope: "book" | "chapter",
  slug?: string
): ExportMetadata => {
  const updatedAt = bundle.updatedAt ?? new Date().toISOString();
  return {
    format,
    sizeBytes: estimateExportBytes(bundle.chapters, format),
    updatedAt,
    scope,
    slug,
  };
};

export const buildExportLinks = ({
  bundle,
  scope,
  slug,
  title,
  basePath = "/exports",
  formats = ["pdf", "epub"],
}: ExportLinkOptions): ExportLink[] => {
  if (scope === "chapter" && !slug) return [];
  const normalizedBase = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
  const updatedAt = formatExportUpdatedDate(bundle.updatedAt ?? new Date().toISOString());
  const label = scope === "book" ? "Full book export" : `${title ?? "Chapter"} export`;
  return formats.map((format) => {
    const meta = buildExportMetadata(bundle, format, scope, slug);
    const href =
      scope === "book"
        ? `${normalizedBase}/book.${format}`
        : `${normalizedBase}/chapters/${slug}.${format}`;
    return {
      label,
      href,
      format,
      size: formatBytes(meta.sizeBytes),
      updatedAt,
      scope,
      slug,
    };
  });
};

export const createBookExportHelpers = ({
  book,
  modules,
  basePath,
  formats,
}: BookExportHelperOptions) => {
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
    if (!chapter) return null;
    return buildBundle([chapter]);
  };

  const getBookExportLinks = () =>
    buildExportLinks({ bundle: getBookExportBundle(), scope: "book", basePath, formats });

  const getChapterExportLinks = (slug: string, title: string) => {
    const bundle = getChapterExportBundle(slug);
    if (!bundle) return [];
    return buildExportLinks({
      bundle,
      scope: "chapter",
      slug,
      title,
      basePath,
      formats,
    });
  };

  return {
    getBookExportBundle,
    getChapterExportBundle,
    getBookExportLinks,
    getChapterExportLinks,
  };
};

export { recordExportEvent } from "./analytics";
export type { ExportAnalyticsEvent } from "./analytics";
export { createExportAnalyticsEndpoint } from "./endpoint";
export type { ExportAnalyticsEndpointOptions } from "./endpoint";
