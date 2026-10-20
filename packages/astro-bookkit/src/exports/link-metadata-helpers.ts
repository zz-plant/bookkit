import { buildExportParts, entryMarkdown } from "./content-parsing";
import { createEpubExport } from "./epub-generator";
import { exportIdentifier, exportPublicationName } from "./metadata";
import { createPdfExport } from "./pdf-generator";
import type {
	BookExportHelperOptions,
	ExportBundle,
	ExportEntry,
	ExportFormat,
	ExportLink,
	ExportLinkOptions,
	ExportMetadata,
	ExportPart,
	ExportRenderOptions,
} from "./types";

export const formatBytes = (bytes: number): string => {
	if (bytes < 1024) return `${bytes} B`;
	const kb = bytes / 1024;
	if (kb < 1024) return `${kb.toFixed(1)} KB`;
	return `${(kb / 1024).toFixed(1)} MB`;
};

export const formatExportUpdatedDate = (updatedAt: string): string =>
	updatedAt.slice(0, 10);

const textLength = (entries: ExportEntry[]): number =>
	entries.reduce(
		(total, entry) =>
			total + entryMarkdown(entry).length + textLength(entry.children ?? []),
		0,
	);

export const estimateExportBytes = (
	parts: ExportPart[],
	format: ExportFormat,
): number => {
	const length = parts.reduce(
		(total, part) => total + textLength(part.entries),
		0,
	);
	const base = format === "pdf" ? 48_000 : 24_000;
	const multiplier = format === "pdf" ? 2.4 : 1.4;
	return Math.round(base + length * multiplier);
};

export const createExportResponse = async (
	bundle: ExportBundle,
	format: ExportFormat,
	filename: string,
	options: ExportRenderOptions = {},
): Promise<Response> => {
	const bytes =
		format === "pdf"
			? await createPdfExport(bundle, options)
			: await createEpubExport(bundle, options);
	return new Response(Uint8Array.from(bytes), {
		headers: {
			"Content-Type":
				format === "pdf" ? "application/pdf" : "application/epub+zip",
			"Content-Disposition": `attachment; filename="${filename}"`,
			"Cache-Control": "public, max-age=86400",
		},
	});
};

export const buildExportMetadata = (
	bundle: ExportBundle,
	format: ExportFormat,
	scope: "book" | "chapter",
	slug?: string,
): ExportMetadata => ({
	format,
	sizeBytes: estimateExportBytes(bundle.parts, format),
	updatedAt: bundle.updatedAt,
	scope,
	slug,
});

export const buildExportLinks = ({
	bundle,
	scope,
	slug,
	title,
	basePath = "/exports",
	formats = ["pdf", "epub"],
}: ExportLinkOptions): ExportLink[] => {
	if (scope === "chapter" && !slug) return [];
	const normalizedBase = basePath.endsWith("/")
		? basePath.slice(0, -1)
		: basePath;
	const updatedAt = bundle.updatedAt
		? formatExportUpdatedDate(bundle.updatedAt)
		: undefined;
	const label = scope === "book" ? "Full book" : (title ?? "Chapter");
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
	formats = ["pdf", "epub"],
	render = {},
}: BookExportHelperOptions) => {
	const parts = buildExportParts(modules, {
		defaultLocale: book.language,
		mechanismOrder: book.mechanismOrder,
	});
	const chapters = parts
		.flatMap((part) => part.entries)
		.filter((entry) => entry.kind === "chapter");
	const edition = {
		title: book.title,
		author: book.author,
		language: book.language,
		version: book.version,
		updatedAt: book.updatedAt,
		draft: book.draft,
		siteUrl: book.siteUrl,
	};
	const bookBundle: ExportBundle = {
		...edition,
		identifier: exportIdentifier(exportPublicationName(book)),
		parts,
	};

	const getBookExportBundle = () => bookBundle;
	// A chapter download is its own publication, so it carries its own identifier.
	const getChapterExportBundle = (slug: string): ExportBundle | null => {
		const chapter = chapters.find((item) => item.slug === slug);
		return chapter
			? {
					...edition,
					identifier: exportIdentifier(
						exportPublicationName(book, `/read/chapters/${slug}`),
					),
					parts: [{ title: "Chapters", entries: [chapter] }],
				}
			: null;
	};

	return {
		/** The formats this book builds and links. */
		formats,
		/** What the PDF and EPUB read besides the bundle: images, fonts, warnings. */
		render,
		getBookExportBundle,
		getChapterExportBundle,
		getBookExportLinks: () =>
			buildExportLinks({
				bundle: bookBundle,
				scope: "book",
				basePath,
				formats,
			}),
		getChapterExportLinks: (slug: string, title: string) => {
			const bundle = getChapterExportBundle(slug);
			return bundle
				? buildExportLinks({
						bundle,
						scope: "chapter",
						slug,
						title,
						basePath,
						formats,
					})
				: [];
		},
	};
};
