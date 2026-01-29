export type ReleaseNote = {
  slug: string;
  title: string;
  version: string;
  date: string;
  summary: string;
  highlights: string[];
  Content?: unknown;
};

type ReleaseModule = {
  frontmatter?: Partial<ReleaseNote>;
  default?: unknown;
};

const releaseModules = import.meta.glob<ReleaseModule>("../content/book/releases/*.mdx", {
  eager: true,
});

export const getReleaseNotes = (): ReleaseNote[] => {
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
        highlights: Array.isArray(frontmatter.highlights) ? frontmatter.highlights : [],
        Content: module.default,
      };
    })
    .filter((release) => release.version && release.date)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
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
