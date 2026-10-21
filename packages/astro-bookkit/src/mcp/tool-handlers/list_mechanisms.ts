import {
	buildResourceUri,
	normalizeModuleSlug,
	resolveResourceTitle,
} from "../resource-utils";
import { DEFAULT_RESOURCE_PREFIX } from "../types";
import { bookArg, contentOf, titleOf, toContentType } from "./book-arg";
import type { ToolHandler } from "./types";

export const handleListMechanisms: ToolHandler = ({ options, args }) => {
	const section = args?.section;
	if (section && toContentType(section) !== "mechanisms") {
		return {
			ok: false,
			summary: "Unsupported list_mechanisms section.",
			error: {
				cause: `Received section=${JSON.stringify(section)}; only mechanisms are currently supported.`,
				nextAction: 'Remove arguments.section or set it to "mechanisms".',
			},
		};
	}

	const picked = bookArg(options, args);
	if (!picked.ok) return picked.response;
	const served = !picked.book || picked.book === options.bookSlug;
	const mechanisms = Object.entries(
		contentOf(options, picked.book).mechanisms,
	).map(([moduleKey, raw]) => {
		const slug = normalizeModuleSlug(moduleKey, "mechanisms");
		return {
			slug,
			title: resolveResourceTitle(raw, slug),
			// Resources serve the served book only.
			uri: served
				? buildResourceUri(
						options.resourcePrefix ?? DEFAULT_RESOURCE_PREFIX,
						"mechanisms",
						slug,
					)
				: undefined,
		};
	});

	return {
		ok: true,
		summary: `Listed ${mechanisms.length} mechanisms.`,
		payload: {
			book: picked.book ?? null,
			bookTitle: titleOf(options, picked.book),
			mechanisms,
			count: mechanisms.length,
		},
	};
};
