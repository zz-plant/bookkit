import { z } from "zod";

export const exampleSchema = z.object({
	mechanism: z.string().min(1, "Example must reference a mechanism slug"),
	domain: z.string().min(1, "Example must define a domain context"),
	title: z.string().min(1, "Example must have a title"),
	status: z
		.enum(["draft", "in-review", "published", "stable"])
		.default("draft"),
});

export type ExampleFrontmatter = z.infer<typeof exampleSchema>;
