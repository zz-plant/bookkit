import { createBookExportHelpersFromConfig } from "./exports";
import { createBookEntryPoints, type BookContentModules, type BookContentRawModules, type BookEntryPoints } from "./entrypoints";
import {
  createBookVersionEntriesFromReleaseModules,
  createReleaseNotesFromModules,
  type BookVersionEntryOptions,
} from "./releases";
import type { ReleaseModule, ReleaseNote } from "../releases/notes";

export type BookEntrypointModules = {
  contentModules: BookContentModules;
  contentRawModules: BookContentRawModules;
  releaseModules: Record<string, ReleaseModule>;
};

export const createBookEntryPointsFromModules = (
  modules: BookEntrypointModules
): BookEntryPoints => {
  return createBookEntryPoints({
    contentModules: modules.contentModules,
    contentRawModules: modules.contentRawModules,
    releaseModules: modules.releaseModules,
  });
};

export const createReleaseNoteHelpers = (
  releaseModules: Record<string, ReleaseModule>,
  options: BookVersionEntryOptions = {}
): {
  releaseModules: Record<string, ReleaseModule>;
  getReleaseNotes: () => ReleaseNote[];
  getVersionEntries: () => ReturnType<typeof createBookVersionEntriesFromReleaseModules>;
} => {
  return {
    releaseModules,
    getReleaseNotes: () => createReleaseNotesFromModules(releaseModules),
    getVersionEntries: () => createBookVersionEntriesFromReleaseModules(releaseModules, options),
  };
};

export const createChapterExportSlugs = (chapterModules: Record<string, unknown>): string[] => {
  return Object.values(chapterModules)
    .map((module) => {
      const typedModule = module as { frontmatter?: { slug?: string } };
      return typedModule.frontmatter?.slug;
    })
    .filter((slug): slug is string => typeof slug === "string" && slug.length > 0);
};

export { createBookExportHelpersFromConfig };
