import { z } from "zod";
import { statusSchema } from "./status";

const runbookStepSchema = z.object({
	when: z.string().optional(),
	action: z.string().min(1, "A runbook step must have an action"),
});

const escalationSchema = z.object({
	to: z.string().min(1, "Escalation target must be named"),
	when: z.string().min(1, "Escalation trigger must be described"),
	withinHours: z.number().positive().optional(),
});

export const toolkitSchema = z
	.object({
		slug: z
			.string()
			.min(1)
			.regex(
				/^[a-z0-9-]+$/,
				"Slug must be lowercase alphanumeric with hyphens",
			),
		status: statusSchema,
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
		/** Branching/conditional steps for runbook procedures. */
		runbookSteps: z.array(runbookStepSchema).default([]),
		/** Who owns the procedure (used by runbook books). */
		owner: z.string().min(1).optional(),
		/** Review cadence for the procedure in days (used by runbook books). */
		reviewEveryDays: z.number().positive().optional(),
		/** Concrete exercises that prove the procedure works. */
		drills: z.array(z.string().min(1)).default([]),
		/** When to hand off and to whom. */
		escalation: escalationSchema.optional(),
		/** Control IDs this procedure satisfies (audit mapping). */
		satisfies: z.array(z.string().min(1)).default([]),
		failureLooksLike: z.array(z.string()).default([]),
		legitimateDemand: z.array(z.string()).default([]),
	})
	.refine((data) => Boolean(data.name || data.title), {
		message: "Tool must have a name or title",
		path: ["name"],
	});

export type ToolkitFrontmatter = z.infer<typeof toolkitSchema>;

/** The name to show for a tool. The schema requires `name` or `title`; `name` wins. */
export const toolkitDisplayName = (frontmatter: {
	name?: string;
	title?: string;
	slug?: string;
}): string =>
	frontmatter.name ||
	frontmatter.title ||
	frontmatter.slug ||
	"Untitled action";
