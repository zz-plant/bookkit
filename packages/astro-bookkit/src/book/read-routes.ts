export const readRoutes = {
  root: "/read",
  overview: "/read/overview",
  tools: "/read/tools",
  analytics: "/read/analytics",
  chapters: "/read/chapters",
  mechanisms: "/read/mechanisms",
  toolkit: "/read/toolkit",
  glossary: "/read/glossary",
  examples: "/read/examples",
} as const;

export type ReadIndexKey = "chapters" | "mechanisms" | "toolkit" | "glossary" | "examples";

export const readSectionPath = (section: ReadIndexKey): string => readRoutes[section];

export const readItemPath = (section: ReadIndexKey, slug: string): string =>
  `${readRoutes[section]}/${slug}`;

export const buildTranslationLede = (base: string, completeness: number | null): string => {
  if (typeof completeness !== "number") {
    return base;
  }

  const percent = Math.round(completeness * 100);
  return `${base} Translation completeness: ${percent}%.`;
};

export const formatTranslationCompleteness = (completeness: number | null): string | null => {
  if (typeof completeness !== "number") {
    return null;
  }

  return `${Math.round(completeness * 100)}% translated`;
};
