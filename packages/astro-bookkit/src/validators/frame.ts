import type { FrameDefinition } from "../frames/types";

export type FrameValidationResult = {
  missingRequiredSteps: string[];
};

export type FrameDefinitionValidationResult = {
  duplicateStepIds: string[];
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

  return { missingRequiredSteps };
};

export const validateFrameDefinition = (
  frame: FrameDefinition,
): FrameDefinitionValidationResult => {
  const stepIds = frame.steps.map((step) => step.id);

  return { duplicateStepIds: findDuplicateIds(stepIds) };
};
