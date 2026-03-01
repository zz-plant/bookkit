import { createBookExportHelpersFromConfig } from "./exports";
import {
  createBookEntryPoints,
  type BookContentModules,
  type BookContentRawModules,
  type BookEntryPoints,
} from "./entrypoints";
import {
  createBookVersionEntriesFromReleaseModules,
  createReleaseNotesFromModules,
  type BookVersionEntryOptions,
} from "./releases";
import type { ReleaseModule, ReleaseNote } from "../releases/notes";

export type BookContentGlob = <T = unknown>(
  pattern: string,
  options?: Record<string, unknown>
) => Record<string, T>;

export type BookEntrypointGlobOptions = {
  contentRoot?: string;
};

const resolveContentPattern = (contentRoot: string, suffix: string): string => {
  const normalizedRoot = contentRoot.endsWith("/") ? contentRoot.slice(0, -1) : contentRoot;
  return `${normalizedRoot}/${suffix}`;
};

export const createBookEntryPointsFromGlob = (
  glob: BookContentGlob,
  options: BookEntrypointGlobOptions = {}
): BookEntryPoints => {
  const contentRoot = options.contentRoot ?? "../content/book";

  const contentModules: BookContentModules = {
    chapters: glob(resolveContentPattern(contentRoot, "chapters/*.mdx"), { eager: true }),
    mechanisms: glob(resolveContentPattern(contentRoot, "mechanisms/*.mdx"), { eager: true }),
    toolkit: glob(resolveContentPattern(contentRoot, "toolkit/*.mdx"), { eager: true }),
    glossary: glob(resolveContentPattern(contentRoot, "glossary/*.mdx"), { eager: true }),
    examples: glob(resolveContentPattern(contentRoot, "examples/**/*.mdx"), { eager: true }),
  };

  const contentRawModules: BookContentRawModules = {
    chapters: glob<string>(resolveContentPattern(contentRoot, "chapters/*.mdx"), {
      eager: true,
      query: "?raw",
      import: "default",
    }),
    mechanisms: glob<string>(resolveContentPattern(contentRoot, "mechanisms/*.mdx"), {
      eager: true,
      query: "?raw",
      import: "default",
    }),
    toolkit: glob<string>(resolveContentPattern(contentRoot, "toolkit/*.mdx"), {
      eager: true,
      query: "?raw",
      import: "default",
    }),
    glossary: glob<string>(resolveContentPattern(contentRoot, "glossary/*.mdx"), {
      eager: true,
      query: "?raw",
      import: "default",
    }),
    examples: glob<string>(resolveContentPattern(contentRoot, "examples/**/*.mdx"), {
      eager: true,
      query: "?raw",
      import: "default",
    }),
  };

  const releaseModules = glob<ReleaseModule>(resolveContentPattern(contentRoot, "releases/*.mdx"), {
    eager: true,
  });

  return createBookEntryPoints({
    contentModules,
    contentRawModules,
    releaseModules,
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
