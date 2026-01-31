import {
  createBookVersionEntriesFromReleaseModules,
  type BookVersionEntry,
} from "@bookkit/astro-bookkit";
import { releaseModules } from "./release-notes";

export const getVersionEntries = (): BookVersionEntry[] => {
  return createBookVersionEntriesFromReleaseModules(releaseModules, {
    latestLabel: "Latest",
  });
};
