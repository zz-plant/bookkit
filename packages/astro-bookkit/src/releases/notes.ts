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
  Content?: unknown;
};

export type ReleaseModule = {
  frontmatter?: Partial<ReleaseNote> & {
    changedSections?: unknown;
  };
  default?: unknown;
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
  return Object.entries(releaseModules)
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
        Content: module.default,
      };
    })
    .filter((release) => release.version && release.date)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
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
