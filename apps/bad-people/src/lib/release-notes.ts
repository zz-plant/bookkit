import {
  createReleaseNotes,
  type ReleaseModule,
  type ReleaseNote,
} from "@bookkit/astro-bookkit";

const releaseModules = import.meta.glob<ReleaseModule>("../content/book/releases/*.mdx", {
  eager: true,
});

export const getReleaseNotes = (): ReleaseNote[] => {
  return createReleaseNotes(releaseModules);
};

export type { ReleaseNote };
