import type { FrameDefinition } from "../frames/types";

export type FrameValidationResult = {
  missingRequiredSteps: string[];
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
