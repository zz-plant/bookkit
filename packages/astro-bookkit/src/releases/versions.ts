import type { ReleaseNote } from "./notes";

export type BookVersionEntry = {
  version: string;
  title?: string;
  label?: string;
  date?: string;
  summary?: string;
  highlights?: string[];
  isLatest?: boolean;
  pathPrefix?: string;
};

type VersionEntryOptions = {
  latestVersion?: string;
  latestLabel?: string;
};

type VersionPathOptions = {
  prefixSegment?: string;
};

export const createVersionEntries = (
  releases: ReleaseNote[],
  { latestVersion, latestLabel = "Latest" }: VersionEntryOptions = {}
): BookVersionEntry[] => {
  return releases.map((release) => ({
    version: release.version,
    title: release.title,
    label: release.version === latestVersion ? latestLabel : release.title || release.version,
    date: release.date,
    summary: release.summary,
    highlights: release.highlights,
    isLatest: release.version === latestVersion,
  }));
};

export const extractVersionFromPath = (
  pathname: string,
  { prefixSegment = "v" }: VersionPathOptions = {}
): string | null => {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === prefixSegment && segments[1]) {
    return segments[1];
  }
  return null;
};

export const stripVersionFromPath = (
  pathname: string,
  { prefixSegment = "v" }: VersionPathOptions = {}
): string => {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === prefixSegment) {
    const remaining = segments.slice(2);
    return remaining.length ? `/${remaining.join("/")}` : "/";
  }
  return pathname || "/";
};

export const buildVersionPath = (
  pathname: string,
  entry: BookVersionEntry,
  { prefixSegment = "v" }: VersionPathOptions = {}
): string => {
  const basePath = stripVersionFromPath(pathname, { prefixSegment });
  if (entry.isLatest) {
    return basePath === "" ? "/" : basePath;
  }
  const normalizedBase = basePath === "/" ? "" : basePath;
  return `/${prefixSegment}/${entry.version}${normalizedBase}`;
};
