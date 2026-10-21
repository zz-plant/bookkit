import { z } from "zod";
import { SLUG_PATTERN } from "./slug";
import { statusSchema } from "./status";

export const mechanismSchema = z.object({
	slug: z
		.string()
		.min(1)
		.regex(SLUG_PATTERN, "Slug must be lowercase alphanumeric with hyphens"),
	status: statusSchema,
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
	/** Control IDs this mechanism satisfies (runbook/audit mapping). */
	satisfies: z.array(z.string().min(1)).default([]),
});

export type MechanismFrontmatter = z.infer<typeof mechanismSchema>;
