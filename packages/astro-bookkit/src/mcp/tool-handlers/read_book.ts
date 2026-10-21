import {
	buildResourceUri,
	normalizeModuleSlug,
	resolveResourceTitle,
} from "../resource-utils";
import { CONTENT_TYPES, DEFAULT_RESOURCE_PREFIX } from "../types";
import {
	bookArg,
	contentOf,
	SECTION_NAMES,
	titleOf,
	toContentType,
} from "./book-arg";
import type { ToolHandler } from "./types";

/**
 * Reads a book's content. Without a slug it returns an index (section, slug,
 * title, length) so a whole book does not land in the caller's context; a
 * slug, or `full: true`, returns the text.
 */
export const handleReadBook: ToolHandler = ({ options, args }) => {
	const picked = bookArg(options, args);
	if (!picked.ok) return picked.response;
	const book = picked.book;
	const bookTitle = titleOf(options, book);
	const served = !book || book === options.bookSlug;

	const rawSection = args?.section;
	const named =
		typeof rawSection === "string" && rawSection.trim().length
			? rawSection.trim()
			: null;
	const section = named ? toContentType(named) : null;
	if (named && !section) {
		return {
			ok: false,
			summary: "Unsupported read_book section.",
			error: {
				cause: `Received section=${JSON.stringify(named)} but supported sections are ${SECTION_NAMES.join(", ")}.`,
				nextAction: "Set arguments.section to a supported section or omit it.",
			},
		};
	}

	const rawSlug = args?.slug;
	const slug =
		typeof rawSlug === "string" && rawSlug.trim().length
			? rawSlug.trim()
			: null;
	const withText = Boolean(slug) || args?.full === true;

	const content = contentOf(options, book);
	const records = CONTENT_TYPES.flatMap((type) => {
		if (section && type !== section) return [];
		return Object.entries(content[type]).map(([moduleKey, raw]) => {
			const normalizedSlug = normalizeModuleSlug(moduleKey, type);
			return {
				section: type,
				slug: normalizedSlug,
				title: resolveResourceTitle(raw, normalizedSlug),
				// Resources serve the served book only.
				uri: served
					? buildResourceUri(
							options.resourcePrefix ?? DEFAULT_RESOURCE_PREFIX,
							type,
							normalizedSlug,
						)
					: undefined,
				lines: raw.split("\n").length,
				...(withText ? { text: raw } : {}),
			};
		});
	}).filter((entry) => !slug || entry.slug === slug);

	if (slug && records.length === 0) {
		return {
			ok: false,
			summary: `No content found for slug ${slug}.`,
			error: {
				cause: `No ${section ?? "content"} entry matched slug "${slug}" for ${bookTitle}.`,
				nextAction:
					"Call bookkit.read_book without slug for the index of sections and slugs, then retry.",
			},
		};
	}

	return {
		ok: true,
		summary: withText
			? `Read ${records.length} content records from ${bookTitle}.`
			: `Indexed ${records.length} content records in ${bookTitle}. Pass slug for one record's text, or full: true for the text of every record listed.`,
		payload: {
			book: book ?? null,
			bookTitle,
			filters: { section, slug, full: args?.full === true },
			records,
			count: records.length,
		},
	};
};
