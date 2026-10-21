import type { FrameDefinition } from "../frames/types";
import { createHeadingSlugger, markdownHeadings } from "../utils/markdown";
import type { NormalizedErrorPayload } from "./normalized-error";

export type FrameValidationResult = {
	missingRequiredSteps: string[];
	errors: NormalizedErrorPayload[];
};

export type FrameDefinitionValidationResult = {
	duplicateStepIds: string[];
	errors: NormalizedErrorPayload[];
};

const findDuplicateIds = (ids: string[]): string[] => {
	const counts = new Map<string, number>();

	ids.forEach((id) => {
		counts.set(id, (counts.get(id) ?? 0) + 1);
	});

	return Array.from(counts.entries())
		.filter(([, count]) => count > 1)
		.map(([id]) => id);
};

export const validateFrameSteps = (
	frame: FrameDefinition,
	presentStepIds: string[],
): FrameValidationResult => {
	const requiredIds = frame.steps
		.filter((step) => step.required)
		.map((step) => step.id);

	const missingRequiredSteps = requiredIds.filter(
		(id) => !presentStepIds.includes(id),
	);

	const errors = missingRequiredSteps.map(
		(stepId) =>
			({
				machineCode: "FRAME_REQUIRED_STEP_MISSING",
				humanSummary: `Frame "${frame.slug}" is missing required step "${stepId}".`,
				location: { module: "validators/frame", file: frame.slug },
				failingRule: "required frame step must be present",
				nextAction: `Add step "${stepId}" to the frame content before validating again.`,
				severity: "error",
				gateLevel: "blocking",
			}) satisfies NormalizedErrorPayload,
	);

	return { missingRequiredSteps, errors };
};

export const validateFrameDefinition = (
	frame: FrameDefinition,
): FrameDefinitionValidationResult => {
	const stepIds = frame.steps.map((step) => step.id);
	const duplicateStepIds = findDuplicateIds(stepIds);
	const errors = duplicateStepIds.map(
		(stepId) =>
			({
				machineCode: "FRAME_DUPLICATE_STEP_ID",
				humanSummary: `Frame "${frame.slug}" defines duplicate step id "${stepId}".`,
				location: { module: "validators/frame", file: frame.slug },
				failingRule: "frame step ids must be unique",
				nextAction: `Rename one of the "${stepId}" steps to a unique id.`,
				severity: "error",
				gateLevel: "blocking",
			}) satisfies NormalizedErrorPayload,
	);

	return { duplicateStepIds, errors };
};

/**
 * The steps of `frame` a page's headings carry: the one rule for a book's
 * overview chapter (`validate`) and for each document of a folder
 * (`bookkit check <dir> --frame`, `bookkit try`). A heading (levels 1 to 4)
 * counts for a step when its whole text slugs to the step's id, the way the
 * site slugs the heading's id: `## Failure Modes`, `## Failure modes`, and
 * `## failure-modes` all count for `failure-modes` (and a link to
 * `#failure-modes` lands on the heading), while `## Failure modes we have
 * seen`, `## Owner`, and a line such as `Owner: Payments` do not. `body` is
 * the page without its frontmatter.
 */
export const frameStepsInPage = (
	frame: FrameDefinition,
	body: string,
): string[] => {
	const slugs = new Set(
		markdownHeadings(body)
			.filter((heading) => heading.depth <= 4)
			// Each heading's own slug: a repeated heading's id gains -1, its slug does not.
			.map((heading) => createHeadingSlugger()(heading.text)),
	);
	return frame.steps
		.filter((step) => slugs.has(step.id))
		.map((step) => step.id);
};
