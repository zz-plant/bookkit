import {
  createReleaseNotesFromModules,
  type ReleaseModule,
  type ReleaseNote,
} from "@bookkit/astro-bookkit";

export const releaseModules = import.meta.glob<ReleaseModule>(
  "../content/book/releases/*.mdx",
  {
    eager: true,
  }
);

export const getReleaseNotes = (): ReleaseNote[] => {
  return createReleaseNotesFromModules(releaseModules);
};

export type { ReleaseNote };
