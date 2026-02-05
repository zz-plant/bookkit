import type { ReleaseModule } from "../releases/notes";

export type BookContentModules = {
  chapters: Record<string, unknown>;
  mechanisms: Record<string, unknown>;
  toolkit: Record<string, unknown>;
  glossary: Record<string, unknown>;
  examples: Record<string, unknown>;
};

export type BookContentRawModules = {
  chapters: Record<string, string>;
  mechanisms: Record<string, string>;
  toolkit: Record<string, string>;
  glossary: Record<string, string>;
  examples: Record<string, string>;
};

export type BookEntryPoints = {
  contentModules: BookContentModules;
  contentRawModules: BookContentRawModules;
  localizedContentModules: Array<Record<string, unknown>>;
  releaseModules: Record<string, ReleaseModule>;
};

export type BookEntryPointsOptions = {
  contentModules: BookContentModules;
  contentRawModules: BookContentRawModules;
  releaseModules: Record<string, ReleaseModule>;
};

export const createBookEntryPoints = (
  options: BookEntryPointsOptions
): BookEntryPoints => {
  const { contentModules, contentRawModules, releaseModules } = options;

  return {
    contentModules,
    contentRawModules,
    localizedContentModules: [
      contentModules.chapters,
      contentModules.mechanisms,
      contentModules.toolkit,
      contentModules.glossary,
      contentModules.examples,
    ],
    releaseModules,
  };
};
