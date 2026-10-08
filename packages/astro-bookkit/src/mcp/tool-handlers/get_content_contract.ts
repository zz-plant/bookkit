import {
	CONTENT_SECTIONS,
	contentContract,
	isContentSection,
} from "../../validators/content-check";
import type { ToolHandler } from "./types";

/** What a content file must contain to compile: fields, meanings, JSON Schema, and a template. */
export const handleGetContentContract: ToolHandler = ({ args }) => {
	const section = args?.section;
	if (section !== undefined && !isContentSection(section)) {
		return {
			ok: false,
			summary: `Unknown section "${String(section)}". Use one of: ${CONTENT_SECTIONS.join(", ")}.`,
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
