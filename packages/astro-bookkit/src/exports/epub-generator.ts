import JSZip from "jszip";
import {
	defaultImageLoader,
	type ExportImageFile,
	imageWarning,
	warnWith,
} from "./images";
import {
	escapeHtml,
	HAS_SCHEME,
	type ImageResolver,
	markdownToHtml,
	readLinkTarget,
	xmlId,
} from "./markdown-to-html";
import {
	EXPORT_KIND_LABELS,
	exportIdentifier,
	exportPublicationName,
	formatExportEdition,
	parseExportDate,
	toEpubTimestamp,
	UNDATED_TIMESTAMP,
} from "./metadata";
import type { ExportBundle, ExportEntry, ExportRenderOptions } from "./types";

/** One content document, and the documents nested under it in the table of contents. */
type NavItem = {
	href: string;
	title: string;
	entry?: ExportEntry;
	children: NavItem[];
};

const STYLES = `body { font-family: Georgia, serif; line-height: 1.6; color: #1b1b1b; }
article, .title-page { max-width: 720px; margin: 0 auto; padding: 1.5rem 1.25rem; }
.title-page { text-align: center; padding-top: 25%; }
.title-page__author { font-size: 1.15rem; }
.title-page__edition, .eyebrow { color: #5a5a5a; }
.eyebrow { text-transform: uppercase; letter-spacing: 0.1em; font-size: 0.75rem; margin-bottom: 0.25rem; }
blockquote { margin: 1rem 0; padding: 0.5rem 1rem; border-left: 3px solid #8f78e6; background: #f5f5ff; }
code, kbd, samp { font-family: "Courier New", monospace; }
code { background: #f1f1f1; padding: 0.1rem 0.3rem; border-radius: 4px; }
kbd { font-size: 0.9em; border: 1px solid #c8c8c8; border-bottom-width: 2px; border-radius: 3px; padding: 0 0.25em; }
pre { background: #f1f1f1; padding: 0.75rem 1rem; border-radius: 4px; white-space: pre-wrap; word-wrap: break-word; }
pre code { background: none; padding: 0; }
table { border-collapse: collapse; margin: 1rem 0; }
th, td { border: 1px solid #c8c8c8; padding: 0.3rem 0.6rem; text-align: left; vertical-align: top; }
th { background: #f1f1f1; }
.align-left { text-align: left; }
.align-center { text-align: center; }
.align-right { text-align: right; }
sup, sub { line-height: 0; }
.details { margin: 1rem 0; padding: 0.25rem 0 0.25rem 1rem; border-left: 3px solid #c8c8c8; }
dt { font-weight: bold; }
dd { margin: 0 0 0.5rem 1.5rem; }
.notes { margin-top: 2rem; border-top: 1px solid #c8c8c8; font-size: 0.9rem; }
img { max-width: 100%; height: auto; }
.image-alt { font-style: italic; color: #5a5a5a; }
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

/** A file name that is safe in a zip path, an OPF href, and an XHTML src. */
const safeFileName = (name: string) => {
	const cleaned = name.normalize("NFC").replace(/[^A-Za-z0-9._-]+/g, "-");
	return /^[A-Za-z0-9]/.test(cleaned) ? cleaned : `image${cleaned}`;
};

export const createEpubExport = async (
	bundle: ExportBundle,
	options: ExportRenderOptions = {},
): Promise<Uint8Array> => {
	const loadImage = options.loadImage ?? defaultImageLoader();
	const warn = warnWith(options);
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
		const record = readLinkTarget(href);
		const target = record && hrefByRecord.get(`${record.kind}:${record.slug}`);
		if (target) {
			return record.fragment ? `${target}#${xmlId(record.fragment)}` : target;
		}
		// A page outside the export: the public site, or plain text without one.
		if (href.startsWith("/") && siteUrl) return `${siteUrl}${href}`;
		return null;
	};

	// Each image file is stored once, under OEBPS/images/, whatever links to it.
	const images = new Map<string, ExportImageFile & { href: string }>();
	const usedImageNames = new Set<string>();
	const imagesOf =
		(entry: ExportEntry): ImageResolver =>
		(image) => {
			const result = loadImage(image.src, entry);
			if ("problem" in result) {
				warn(imageWarning({ format: "EPUB", entry, image, ...result }));
				return null;
			}
			let stored = images.get(result.file.key);
			if (!stored) {
				const name = safeFileName(result.file.name);
				const dot = name.lastIndexOf(".");
				const stem = dot > 0 ? name.slice(0, dot) : name;
				const extension = dot > 0 ? name.slice(dot) : "";
				let unique = name;
				for (let n = 2; usedImageNames.has(unique); n += 1) {
					unique = `${stem}-${n}${extension}`;
				}
				usedImageNames.add(unique);
				stored = { ...result.file, href: `images/${unique}` };
				images.set(result.file.key, stored);
			}
			return `../${stored.href}`;
		};

	const renderDocument = (item: NavItem) => {
		const { entry } = item;
		const label = entry ? EXPORT_KIND_LABELS[entry.kind] : null;
		const content = entry
			? `\n${markdownToHtml(entry.body, resolveLink, imagesOf(entry))}`
			: "";
		return xhtmlDocument({
			title: item.title,
			language: entry?.locale ?? language,
			stylesheet: "../styles.css",
			body: `    <article>
      ${label ? `<p class="eyebrow">${escapeHtml(label)}</p>\n      ` : ""}<h1>${escapeHtml(item.title)}</h1>${content}
    </article>`,
		});
	};

	// Rendered before the package document, which lists the images they show.
	const drafts = documents.map((item) => ({
		item,
		xhtml: renderDocument(item),
	}));
	// A link to a heading a document does not have goes to the top of that
	// document, as the PDF's does, rather than to a fragment no reader can find.
	const ids = new Map(
		drafts.map(({ item, xhtml }) => [
			item.href,
			new Set(
				Array.from(xhtml.matchAll(/\sid="([^"]+)"/g), (match) => match[1]),
			),
		]),
	);
	const rendered = drafts.map(({ item, xhtml }) => ({
		item,
		xhtml: xhtml.replace(
			/\shref="([^"#:]*)#([^"]+)"/g,
			(link, file: string, fragment: string) =>
				ids.get(file || item.href)?.has(fragment) === false
					? ` href="${file || item.href}"`
					: link,
		),
	}));

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
${documents.map((item) => `    <item id="${manifestId(item)}" href="text/${item.href}" media-type="application/xhtml+xml"/>`).join("\n")}${[
	...images.values(),
]
	.map(
		(image, index) =>
			`\n    <item id="image-${index + 1}" href="${image.href}" media-type="${image.mediaType}"/>`,
	)
	.join("")}
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
	for (const { item, xhtml } of rendered) {
		add(`OEBPS/text/${item.href}`, xhtml);
	}
	for (const image of images.values()) {
		zip.file(`OEBPS/${image.href}`, image.bytes, {
			date: entryDate,
			createFolders: false,
		});
	}

	return zip.generateAsync({
		type: "uint8array",
		compression: "DEFLATE",
		compressionOptions: { level: 9 },
	});
};
