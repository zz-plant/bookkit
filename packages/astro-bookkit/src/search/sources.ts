import type { SearchContentSource } from "./index";

type BookSearchModuleMap = {
  chapters: Record<string, string>;
  mechanisms: Record<string, string>;
  toolkit: Record<string, string>;
  glossary: Record<string, string>;
  examples: Record<string, string>;
};

const defaultBookSearchSources = [
  {
    type: "chapters",
    label: "Chapters",
    urlPrefix: "/read/chapters/",
    titleKey: "title",
  },
  {
    type: "mechanisms",
    label: "Mechanisms",
    urlPrefix: "/read/mechanisms/",
    titleKey: "title",
  },
  {
    type: "toolkit",
    label: "Toolkit",
    urlPrefix: "/read/toolkit/",
    titleKey: "name",
  },
  {
    type: "glossary",
    label: "Glossary",
    urlPrefix: "/read/glossary/",
    titleKey: "term",
  },
  {
    type: "examples",
    label: "Examples",
    urlPrefix: "/read/examples/",
    titleKey: "title",
  },
] as const;

export const createBookSearchSources = (
  modules: BookSearchModuleMap
): SearchContentSource[] => {
  return defaultBookSearchSources.map((source) => ({
    ...source,
    modules: modules[source.type],
  }));
};

export type { BookSearchModuleMap };
