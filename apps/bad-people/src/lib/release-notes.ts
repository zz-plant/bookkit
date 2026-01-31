import {
  createReleaseNotesFromModules,
  type ReleaseNote,
} from "@bookkit/astro-bookkit";
import { bookEntryPoints } from "./book-entrypoints";

export const releaseModules = bookEntryPoints.releaseModules;

export const getReleaseNotes = (): ReleaseNote[] => {
  return createReleaseNotesFromModules(releaseModules);
};

export type { ReleaseNote };
