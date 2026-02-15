export const RELEASE_SECTION_SLUGS = [
  "overview",
  "chapters",
  "mechanisms",
  "toolkit",
  "glossary",
  "examples",
] as const;

export type ReleaseSectionSlug = (typeof RELEASE_SECTION_SLUGS)[number];

export type ReleaseNote = {
  slug: string;
  title: string;
  version: string;
  date: string;
  summary: string;
  highlights: string[];
  changedSections: ReleaseSectionSlug[];
  sectionSnapshots: Partial<Record<ReleaseSectionSlug, string>>;
  sectionChangeSource: "manual" | "snapshot-diff";
  Content?: unknown;
};

export type ReleaseModule = {
  frontmatter?: Partial<ReleaseNote> & {
    changedSections?: unknown;
    sectionSnapshots?: unknown;
  };
  default?: unknown;
};

const normalizeSectionSnapshots = (value: unknown): Partial<Record<ReleaseSectionSlug, string>> => {
  if (!value || typeof value !== "object") return {};

  const allowed = new Set<string>(RELEASE_SECTION_SLUGS);
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, raw]) => [key.trim().toLowerCase(), typeof raw === "string" ? raw.trim() : ""] as const)
      .filter(([key, fingerprint]) => allowed.has(key) && fingerprint.length > 0)
  ) as Partial<Record<ReleaseSectionSlug, string>>;
};

const deriveChangedSectionsFromSnapshots = (
  current: Partial<Record<ReleaseSectionSlug, string>>,
  previous: Partial<Record<ReleaseSectionSlug, string>>,
): ReleaseSectionSlug[] => {
  const changed: ReleaseSectionSlug[] = [];

  for (const section of RELEASE_SECTION_SLUGS) {
    const currentFingerprint = current[section];
    const previousFingerprint = previous[section];
    if (!currentFingerprint && !previousFingerprint) continue;
    if (!previousFingerprint || !currentFingerprint || currentFingerprint !== previousFingerprint) {
      changed.push(section);
    }
  }

  return changed;
};

const normalizeChangedSections = (value: unknown): ReleaseSectionSlug[] => {
  if (!Array.isArray(value)) return [];

  const allowed = new Set<string>(RELEASE_SECTION_SLUGS);
  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : ""))
        .filter((item): item is ReleaseSectionSlug => Boolean(item) && allowed.has(item))
    )
  );
};

const normalizeHighlights = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
};

export const createReleaseNotes = (
  releaseModules: Record<string, ReleaseModule>
): ReleaseNote[] => {
  const releases = Object.entries(releaseModules)
    .map(([path, module]) => {
      const slug = path.split("/").pop()?.replace(/\.mdx$/, "") ?? "";
      const frontmatter = module.frontmatter ?? {};
      return {
        slug,
        title: frontmatter.title ?? "",
        version: frontmatter.version ?? "",
        date: frontmatter.date ?? "",
        summary: frontmatter.summary ?? "",
        highlights: normalizeHighlights(frontmatter.highlights),
        changedSections: normalizeChangedSections(frontmatter.changedSections),
        sectionSnapshots: normalizeSectionSnapshots(frontmatter.sectionSnapshots),
        sectionChangeSource: "manual" as const,
        Content: module.default,
      };
    })
    .filter((release) => release.version && release.date)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const chronological = [...releases].reverse();
  let previousSnapshots: Partial<Record<ReleaseSectionSlug, string>> = {};

  for (const release of chronological) {
    const hasSnapshots = Object.keys(release.sectionSnapshots).length > 0;
    if (!hasSnapshots) continue;

    release.changedSections = deriveChangedSectionsFromSnapshots(release.sectionSnapshots, previousSnapshots);
    release.sectionChangeSource = "snapshot-diff";
    previousSnapshots = release.sectionSnapshots;
  }

  return releases;
};

export const createLatestSectionChangeMap = (
  releases: ReleaseNote[],
): Record<ReleaseSectionSlug, { version: string; date: string }> => {
  const latestBySection = {} as Record<ReleaseSectionSlug, { version: string; date: string }>;

  for (const release of releases) {
    for (const section of release.changedSections) {
      if (!latestBySection[section]) {
        latestBySection[section] = {
          version: release.version,
          date: release.date,
        };
      }
    }
  }

  return latestBySection;
};

export const formatReleaseDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
};

export const escapeXml = (value: string): string => {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
};
