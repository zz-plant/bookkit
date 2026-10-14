import JSZip from "jszip";
import { escapeHtml, markdownToHtml, xmlId } from "./markdown-to-html";
import {
	EXPORT_KIND_LABELS,
	exportIdentifier,
	exportPublicationName,
	formatExportEdition,
	parseExportDate,
	toEpubTimestamp,
	UNDATED_TIMESTAMP,
} from "./metadata";
import type { ExportBundle, ExportEntry, ExportEntryKind } from "./types";

/** One content document, and the documents nested under it in the table of contents. */
type NavItem = {
	href: string;
	title: string;
	entry?: ExportEntry;
	children: NavItem[];
};

// Read UI sections, so a link to /read/<section>/<slug> can point inside the book.
const SECTION_KINDS: Record<string, ExportEntryKind> = {
	chapters: "chapter",
	mechanisms: "mechanism",
	toolkit: "tool",
	glossary: "glossary",
	examples: "example",
};
const READ_LINK = /^\/?read\/([a-z]+)\/([^?#]+)(?:\?[^#]*)?(?:#(.*))?$/;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

const STYLES = `body { font-family: Georgia, serif; line-height: 1.6; color: #1b1b1b; }
article, .title-page { max-width: 720px; margin: 0 auto; padding: 1.5rem 1.25rem; }
.title-page { text-align: center; padding-top: 25%; }
.title-page__author { font-size: 1.15rem; }
.title-page__edition, .eyebrow { color: #5a5a5a; }
.eyebrow { text-transform: uppercase; letter-spacing: 0.1em; font-size: 0.75rem; margin-bottom: 0.25rem; }
blockquote { margin: 1rem 0; padding: 0.5rem 1rem; border-left: 3px solid #8f78e6; background: #f5f5ff; }
code { font-family: "Courier New", monospace; background: #f1f1f1; padding: 0.1rem 0.3rem; border-radius: 4px; }
`;

const xhtmlDocument = (options: {
	title: string;
	language: string;
	stylesheet: string;
	body: string;
}) => `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escapeHtml(options.language)}" xml:lang="${escapeHtml(options.language)}">
  <head>
    <title>${escapeHtml(options.title)}</title>
    <link rel="stylesheet" type="text/css" href="${options.stylesheet}" />
  </head>
  <body>
${options.body}
  </body>
</html>
`;

const navList = (items: NavItem[]): string =>
	`<ol>${items
		.map(
			(item) =>
				`<li><a href="text/${item.href}">${escapeHtml(item.title)}</a>${item.children.length > 0 ? navList(item.children) : ""}</li>`,
		)
		.join("")}</ol>`;

const flatten = (items: NavItem[]): NavItem[] =>
	items.flatMap((item) => [item, ...flatten(item.children)]);

export const createEpubExport = async (
	bundle: ExportBundle,
): Promise<Uint8Array> => {
	const language = bundle.language?.trim() || "en";
	const released = parseExportDate(bundle.updatedAt);
	const modified = released ? toEpubTimestamp(released) : UNDATED_TIMESTAMP;
	const identifier =
		bundle.identifier ??
		exportIdentifier(exportPublicationName({ title: bundle.title }));
	const siteUrl = bundle.siteUrl?.trim().replace(/\/+$/, "");

	// File names come from slugs, which repeat across sections (a mechanism and its glossary term).
	const usedIds = new Set<string>();
	const uniqueHref = (base: string) => {
		const stem = xmlId(base);
		let id = stem;
		for (let n = 2; usedIds.has(id); n += 1) id = `${stem}-${n}`;
		usedIds.add(id);
		return `${id}.xhtml`;
	};
	const hrefByRecord = new Map<string, string>();
	const toItem = (entry: ExportEntry): NavItem => {
		const href = uniqueHref(`${entry.kind}-${entry.slug}`);
		const key = `${entry.kind}:${entry.slug}`;
		if (!hrefByRecord.has(key)) hrefByRecord.set(key, href);
		return {
			href,
			title: entry.title,
			entry,
			children: (entry.children ?? []).map(toItem),
		};
	};
	// Part headings only help when there is more than one part.
	const tree: NavItem[] =
		bundle.parts.length > 1
			? bundle.parts.map((part, index) => ({
					href: uniqueHref(`part-${index + 1}`),
					title: part.title,
					children: part.entries.map(toItem),
				}))
			: bundle.parts.flatMap((part) => part.entries.map(toItem));
	const documents = flatten(tree);

	const resolveLink = (href: string): string | null => {
		if (href.startsWith("#")) return `#${xmlId(href.slice(1))}`;
		if (HAS_SCHEME.test(href)) return href;
		const match = href.match(READ_LINK);
		const kind = match ? SECTION_KINDS[match[1]] : undefined;
		const target = kind && hrefByRecord.get(`${kind}:${match?.[2]}`);
		if (target) return match?.[3] ? `${target}#${xmlId(match[3])}` : target;
		// A page outside the export: the public site, or plain text without one.
		if (href.startsWith("/") && siteUrl) return `${siteUrl}${href}`;
		return null;
	};

	const renderDocument = (item: NavItem) => {
		const { entry } = item;
		const label = entry ? EXPORT_KIND_LABELS[entry.kind] : null;
		const content = entry ? `\n${markdownToHtml(entry.body, resolveLink)}` : "";
		return xhtmlDocument({
			title: item.title,
			language: entry?.locale ?? language,
			stylesheet: "../styles.css",
			body: `    <article>
      ${label ? `<p class="eyebrow">${escapeHtml(label)}</p>\n      ` : ""}<h1>${escapeHtml(item.title)}</h1>${content}
    </article>`,
		});
	};

	const edition = formatExportEdition(bundle);
	const titlePage = xhtmlDocument({
		title: bundle.title,
		language,
		stylesheet: "styles.css",
		body: `    <section class="title-page" epub:type="titlepage">
      <h1>${escapeHtml(bundle.title)}</h1>${bundle.author ? `\n      <p class="title-page__author">${escapeHtml(bundle.author)}</p>` : ""}${edition ? `\n      <p class="title-page__edition">${escapeHtml(edition)}</p>` : ""}
    </section>`,
	});
	const nav = xhtmlDocument({
		title: `${bundle.title}: contents`,
		language,
		stylesheet: "styles.css",
		body: `    <nav epub:type="toc" id="toc">
      <h1>Contents</h1>
      ${tree.length > 0 ? navList(tree) : `<ol><li><a href="title.xhtml">${escapeHtml(bundle.title)}</a></li></ol>`}
    </nav>`,
	});

	const creator = bundle.author
		? `
    <dc:creator id="creator">${escapeHtml(bundle.author)}</dc:creator>
    <meta refines="#creator" property="role" scheme="marc:relators">aut</meta>`
		: "";
	const date = released
		? `\n    <dc:date>${toEpubTimestamp(released).slice(0, 10)}</dc:date>`
		: "";
	const manifestId = (item: NavItem) => item.href.replace(/\.xhtml$/, "");
	const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${escapeHtml(language)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${escapeHtml(identifier)}</dc:identifier>
    <dc:title>${escapeHtml(bundle.title)}</dc:title>${creator}
    <dc:language>${escapeHtml(language)}</dc:language>${date}
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="styles.css" media-type="text/css"/>
    <item id="title-page" href="title.xhtml" media-type="application/xhtml+xml"/>
${documents.map((item) => `    <item id="${manifestId(item)}" href="text/${item.href}" media-type="application/xhtml+xml"/>`).join("\n")}
  </manifest>
  <spine>
    <itemref idref="title-page"/>
    <itemref idref="nav"/>
${documents.map((item) => `    <itemref idref="${manifestId(item)}"/>`).join("\n")}
  </spine>
</package>
`;

	// Fixed entry times keep the archive byte-identical across builds; zip dates start in 1980.
	const entryDate = new Date(
		Math.max(Date.parse(modified), Date.parse(UNDATED_TIMESTAMP)),
	);
	const zip = new JSZip();
	const add = (path: string, content: string) =>
		zip.file(path, content, { date: entryDate, createFolders: false });
	// The OCF container requires `mimetype` first and uncompressed.
	zip.file("mimetype", "application/epub+zip", {
		date: entryDate,
		createFolders: false,
		compression: "STORE",
	});
	add(
		"META-INF/container.xml",
		`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`,
	);
	add("OEBPS/content.opf", opf);
	add("OEBPS/nav.xhtml", nav);
	add("OEBPS/styles.css", STYLES);
	add("OEBPS/title.xhtml", titlePage);
	for (const item of documents) {
		add(`OEBPS/text/${item.href}`, renderDocument(item));
	}

	return zip.generateAsync({
		type: "uint8array",
		compression: "DEFLATE",
		compressionOptions: { level: 9 },
	});
};
