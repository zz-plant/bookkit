import { z } from "zod";

export const chapterSchema = z.object({
	slug: z
		.string()
		.min(1)
		.regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
	title: z.string().min(1, "Chapter must have a title"),
	status: z
		.enum(["draft", "in-review", "published", "stable"])
		.default("draft"),
	order: z.number().optional(),
	prerequisites: z.array(z.string()).default([]),
	mechanisms: z.array(z.string()).default([]),
});

export type ChapterFrontmatter = z.infer<typeof chapterSchema>;
