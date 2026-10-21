import { CONTENT_TYPES } from "../types";
import { bookArg, contentOf, titleOf } from "./book-arg";
import type { ToolHandler } from "./types";

export const handleListContent: ToolHandler = ({ options, args }) => {
	const picked = bookArg(options, args);
	if (!picked.ok) return picked.response;
	const content = contentOf(options, picked.book);
	const bookTitle = titleOf(options, picked.book);
	const sections = CONTENT_TYPES.map((section) => ({
		section,
		count: Object.keys(content[section]).length,
	}));

	return {
		ok: true,
		summary: `Listed content counts for ${bookTitle}.`,
		payload: {
			book: picked.book ?? null,
			bookTitle,
			sections,
			total: sections.reduce((sum, entry) => sum + entry.count, 0),
		},
	};
};
