import { createReleaseNoteHelpers, type ReleaseNote } from "@bookkit/astro-bookkit";
import { bookEntryPoints } from "./book-entrypoints";

const releaseHelpers = createReleaseNoteHelpers(bookEntryPoints.releaseModules, {
  latestLabel: "Latest",
});

export const { releaseModules, getReleaseNotes, getVersionEntries } = releaseHelpers;

export type { ReleaseNote };
