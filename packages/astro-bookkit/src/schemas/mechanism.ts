import { z } from "zod";

export const mechanismSchema = z.object({
	slug: z
		.string()
		.min(1)
		.regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
	status: z
		.enum(["draft", "in-review", "published", "stable"])
		.default("draft"),
	title: z.string().min(1, "Mechanism must have a non-empty title"),
	definition: z.string().min(1, "Mechanism must have a definition"),
	is: z
		.array(z.string().min(1))
		.min(1, "Mechanism must have at least one 'is' boundary"),
	isNot: z
		.array(z.string().min(1))
		.min(1, "Mechanism must have at least one 'isNot' boundary"),
	predictions: z
		.array(z.string().min(1))
		.min(1, "Mechanism must have at least one prediction"),
	tests: z
		.array(z.string().min(1))
		.min(1, "Mechanism must have at least one test"),
});

export type MechanismFrontmatter = z.infer<typeof mechanismSchema>;
