import { z } from "zod";
import { SLUG_PATTERN } from "./slug";
import { statusSchema } from "./status";

export const chapterSchema = z.object({
	slug: z
		.string()
		.min(1)
		.regex(SLUG_PATTERN, "Slug must be lowercase alphanumeric with hyphens"),
	title: z.string().min(1, "Chapter must have a title"),
	status: statusSchema,
	order: z.number().optional(),
	/** One or two sentences for search results and link previews; the first paragraph is used when absent. */
	summary: z.string().optional(),
	prerequisites: z.array(z.string()).default([]),
	mechanisms: z.array(z.string()).default([]),
});

export type ChapterFrontmatter = z.infer<typeof chapterSchema>;
