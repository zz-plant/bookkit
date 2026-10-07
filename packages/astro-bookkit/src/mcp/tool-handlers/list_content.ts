import { CONTENT_TYPES } from "../types";
import type { ToolHandler } from "./types";

export const handleListContent: ToolHandler = ({ options }) => {
	const sections = CONTENT_TYPES.map((section) => ({
		section,
		count: Object.keys(options.contentRawModules[section]).length,
	}));

	return {
		ok: true,
		summary: `Listed content counts for ${options.bookTitle}.`,
		payload: {
			bookTitle: options.bookTitle,
			sections,
			total: sections.reduce((sum, entry) => sum + entry.count, 0),
		},
	};
};
