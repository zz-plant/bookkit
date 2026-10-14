import type { FrameDefinition } from "../frames/types";
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

/** The prefix a heading word must start with to count as a step: the id's first word, cut to five letters. */
const stepStem = (stepId: string): string => {
	const word = stepId.split("-")[0] ?? stepId;
	return word.length > 5 ? word.slice(0, 5) : word.replace(/s$/, "");
};

/**
 * The frame steps a document's headings cover. A heading covers a step when
 * one of its words starts with the step's stem, so "Owner" covers ownership,
 * "Verify" covers verification, and "Step 3" covers steps. Used where a frame
 * applies to each document of a folder (`bookkit try`, `bookkit check <dir>`);
 * a book's overview chapter is still checked by `validateBook`.
 */
export const frameStepsInHeadings = (
	frame: FrameDefinition,
	headings: string[],
): string[] => {
	const words = new Set(
		headings.flatMap((heading) =>
			heading
				.toLowerCase()
				.split(/[^a-z0-9]+/)
				.filter(Boolean),
		),
	);
	return frame.steps
		.filter((step) => {
			const stem = stepStem(step.id);
			return [...words].some((word) => word.startsWith(stem));
		})
		.map((step) => step.id);
};
