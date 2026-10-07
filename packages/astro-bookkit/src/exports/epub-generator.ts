import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import { escapeHtml, markdownToHtml } from "./markdown-to-html";
import type { ExportBundle, ExportChapter } from "./types";

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
<html xmlns="http://www.w3.org/1999/xhtml" lang="${escapeHtml(chapter.locale ?? "en")}">
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

export const createEpubExport = async (
	bundle: ExportBundle,
): Promise<Uint8Array> => {
	const zip = new JSZip();
	zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
	zip.folder("META-INF")?.file(
		"container.xml",
		`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>`,
	);

	const oebps = zip.folder("OEBPS");
	const chaptersFolder = oebps?.folder("chapters");
	const chapterSlugs = bundle.chapters.map((chapter) => chapter.slug);
	const chapterItems = bundle.chapters.map((chapter) => {
		const filename = `${chapter.slug}.xhtml`;
		chaptersFolder?.file(filename, buildChapterHtml(chapter, chapterSlugs));
		return {
			id: `chap-${chapter.slug}`,
			href: `chapters/${filename}`,
			title: chapter.title,
		};
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
`,
	);

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
      <ol>${chapterItems.map((item) => `<li><a href="${item.href}">${escapeHtml(item.title)}</a></li>`).join("")}</ol>
    </nav>
  </body>
</html>`,
	);

	const updated = bundle.updatedAt ?? new Date().toISOString();
	oebps?.file(
		"content.opf",
		`<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="book-id" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">urn:uuid:${randomUUID()}</dc:identifier>
    <dc:title>${escapeHtml(bundle.title)}</dc:title>
    <dc:language>en</dc:language>
    <dc:date>${escapeHtml(updated)}</dc:date>
    <meta property="dcterms:modified">${escapeHtml(updated)}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="styles.css" media-type="text/css"/>
    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>
    ${chapterItems.map((item) => `<item id="${item.id}" href="${item.href}" media-type="application/xhtml+xml"/>`).join("\n    ")}
  </manifest>
  <spine>
    <itemref idref="cover" />
    ${chapterItems.map((item) => `<itemref idref="${item.id}" />`).join("\n    ")}
  </spine>
</package>`,
	);

	return zip.generateAsync({ type: "uint8array" });
};
