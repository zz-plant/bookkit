import { z } from "zod";

export const glossarySchema = z.object({
	slug: z.string().optional(),
	status: z
		.enum(["draft", "in-review", "published", "stable"])
		.default("draft"),
	term: z.string().min(1, "Glossary entry must have a term name"),
	definition: z.string().optional(),
	mechanisms: z.array(z.string()).default([]),
});

export type GlossaryFrontmatter = z.infer<typeof glossarySchema>;
