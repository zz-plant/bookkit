import { createVersionEntries, type BookVersionEntry } from "@bookkit/astro-bookkit";
import { getReleaseNotes } from "./release-notes";

export const getVersionEntries = (): BookVersionEntry[] => {
  const releases = getReleaseNotes();
  if (!releases.length) return [];
  const latestVersion = releases[0].version;
  return createVersionEntries(releases, { latestVersion, latestLabel: "Latest" });
};
