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

export const registerDefaultFrames = (): FrameDefinition[] => {
  // Rationale: allow safe re-entry so apps can call this in setup without guarding.
  defaultFrames.forEach((frame) => {
    if (getFrame(frame.slug)) return;
    registerFrame(frame);
  });
  return defaultFrames;
};
