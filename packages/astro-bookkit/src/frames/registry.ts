import type { FrameDefinition } from "./types";

const frames = new Map<string, FrameDefinition>();

export const findDuplicateFrameStepIds = (frame: FrameDefinition): string[] => {
	const counts = new Map<string, number>();
	for (const step of frame.steps) {
		counts.set(step.id, (counts.get(step.id) ?? 0) + 1);
	}
	return Array.from(counts.entries())
		.filter(([, count]) => count > 1)
		.map(([id]) => id);
};

export const registerFrame = (frame: FrameDefinition): void => {
	// Rationale: fail fast on duplicate slugs/steps to keep frames enforceable and stable.
	if (frames.has(frame.slug)) {
		throw new Error(
			`Frame slug "${frame.slug}" is already registered. Use a unique slug or remove the prior registration.`,
		);
	}

	const duplicateStepIds = findDuplicateFrameStepIds(frame);
	if (duplicateStepIds.length > 0) {
		throw new Error(
			`Frame "${frame.slug}" has duplicate step ids: ${duplicateStepIds.join(
				", ",
			)}. Step ids must be unique.`,
		);
	}

	frames.set(frame.slug, frame);
};

export const getFrame = (slug: string): FrameDefinition | undefined =>
	frames.get(slug);

export const listFrames = (): FrameDefinition[] => Array.from(frames.values());
