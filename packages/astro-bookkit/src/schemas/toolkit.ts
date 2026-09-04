import { z } from "zod";

export const toolkitSchema = z
	.object({
		slug: z
			.string()
			.min(1)
			.regex(
				/^[a-z0-9-]+$/,
				"Slug must be lowercase alphanumeric with hyphens",
			),
		mechanism: z
			.string()
			.min(1, "Tool must reference an associated mechanism slug"),
		name: z.string().optional(),
		title: z.string().optional(),
		trigger: z.string().optional(),
		timeboxMinutes: z
			.number()
			.positive()
			.max(10, "Action primitives must be executable in <= 10 minutes")
			.optional(),
		steps: z.array(z.string().min(1)).default([]),
		failureLooksLike: z.array(z.string()).default([]),
		legitimateDemand: z.array(z.string()).default([]),
	})
	.refine((data) => Boolean(data.name || data.title), {
		message: "Tool must have a name or title",
		path: ["name"],
	});

export type ToolkitFrontmatter = z.infer<typeof toolkitSchema>;
