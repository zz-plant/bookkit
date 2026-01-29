import type { FrameDefinition } from "./types";
import { getFrame, registerFrame } from "./registry";

// Rationale: codify the frame steps described in the repository docs so validation can enforce them.
export const defaultFrames: FrameDefinition[] = [
  {
    slug: "intervention",
    name: "Intervention",
    steps: [
      { id: "recognition", label: "Recognition", required: true },
      { id: "exoneration", label: "Exoneration", required: true },
      { id: "mechanism", label: "Mechanism", required: true },
      { id: "agency", label: "Agency", required: true },
    ],
  },
  {
    slug: "explainer",
    name: "Explainer",
    steps: [
      { id: "definition", label: "Definition", required: true },
      { id: "example", label: "Example", required: true },
      { id: "implication", label: "Implication", required: true },
    ],
  },
  {
    slug: "field-guide",
    name: "Field Guide",
    steps: [
      { id: "steps", label: "Steps", required: true },
      { id: "failure-modes", label: "Failure Modes", required: true },
      { id: "checklist", label: "Checklist", required: true },
    ],
  },
];

const framesMatch = (
  existing: FrameDefinition,
  incoming: FrameDefinition,
): boolean =>
  existing.slug === incoming.slug &&
  existing.name === incoming.name &&
  existing.steps.length === incoming.steps.length &&
  existing.steps.every((step, index) => {
    const incomingStep = incoming.steps[index];
    return (
      step.id === incomingStep.id &&
      step.label === incomingStep.label &&
      step.required === incomingStep.required
    );
  });

export const registerDefaultFrames = (): FrameDefinition[] => {
  // Rationale: allow safe re-entry while ensuring defaults remain canonical.
  defaultFrames.forEach((frame) => {
    const existing = getFrame(frame.slug);
    if (existing) {
      if (!framesMatch(existing, frame)) {
        throw new Error(
          `Frame slug "${frame.slug}" is already registered with a different definition. Remove the conflicting registration or choose a unique slug.`,
        );
      }
      return;
    }
    registerFrame(frame);
  });
  return defaultFrames;
};
