import type { FrameDefinition } from "./types";

const frames = new Map<string, FrameDefinition>();

export const registerFrame = (frame: FrameDefinition): void => {
  frames.set(frame.slug, frame);
};

export const getFrame = (slug: string): FrameDefinition | undefined =>
  frames.get(slug);

export const listFrames = (): FrameDefinition[] => Array.from(frames.values());
