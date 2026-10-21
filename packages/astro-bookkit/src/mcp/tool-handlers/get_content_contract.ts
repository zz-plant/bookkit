import {
	CONTENT_SECTIONS,
	contentContract,
} from "../../validators/content-check";
import { toSection } from "./book-arg";
import type { ToolHandler } from "./types";

/** What a content file must contain to compile: fields, meanings, JSON Schema, and a template. */
export const handleGetContentContract: ToolHandler = ({ args }) => {
	const section = toSection(args?.section);
	if (args?.section !== undefined && !section) {
		return {
			ok: false,
			summary: `Unknown section "${String(args?.section)}". Use one of: ${CONTENT_SECTIONS.join(", ")}.`,
			error: {
				cause: "invalid section",
				machineCode: "CONTENT_SECTION_UNKNOWN",
				nextAction: `Pass section as one of: ${CONTENT_SECTIONS.join(", ")}, or omit it for all.`,
			},
		};
	}
	const sections = section ? [section] : [...CONTENT_SECTIONS];
	return {
		ok: true,
		summary: `Content contract for ${sections.join(", ")}. Fields marked error must be present to compile; warning fields are reported until filled.`,
		payload: { contracts: sections.map(contentContract) },
	};
};
