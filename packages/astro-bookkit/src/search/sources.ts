import type { SearchContentSource } from "./index";
import { normalizeLocaleCode } from "../localization/content";

type BookSearchModuleMap = {
  chapters: Record<string, string>;
  mechanisms: Record<string, string>;
  toolkit: Record<string, string>;
  glossary: Record<string, string>;
  examples: Record<string, string>;
};

type LocalizedSearchOptions = {
  locale?: string;
  defaultLocale?: string;
};

const defaultBookSearchSources = [
  {
    type: "chapters",
    label: "Chapters",
    order: 1,
    urlPrefix: "/read/chapters/",
    titleKey: "title",
  },
  {
    type: "mechanisms",
    label: "Mechanisms",
    order: 2,
    urlPrefix: "/read/mechanisms/",
    titleKey: "title",
  },
  {
    type: "toolkit",
    label: "Toolkit",
    order: 3,
    urlPrefix: "/read/toolkit/",
    titleKey: "name",
  },
  {
    type: "glossary",
    label: "Glossary",
    order: 4,
    urlPrefix: "/read/glossary/",
    titleKey: "term",
  },
  {
    type: "examples",
    label: "Examples",
    order: 5,
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

export const createLocalizedSearchSources = (
  modules: BookSearchModuleMap,
  options: LocalizedSearchOptions
): SearchContentSource[] => {
  const defaultLocale = normalizeLocaleCode(options.defaultLocale) ?? "default";
  const requestedLocale = normalizeLocaleCode(options.locale);

  return defaultBookSearchSources.map((source) => ({
    ...source,
    modules: Object.fromEntries(
      Object.entries(modules[source.type]).filter(([, raw]) => {
        if (!requestedLocale) return true;
        const match = raw.match(/\nlocale:\s*([^\n]+)\n/);
        const localeValue = normalizeLocaleCode(match?.[1]);
        return localeValue ? localeValue === requestedLocale : requestedLocale === defaultLocale;
      })
    ),
  }));
};

export type { BookSearchModuleMap, LocalizedSearchOptions };
