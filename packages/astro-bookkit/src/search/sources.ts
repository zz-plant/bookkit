import { normalizeLocaleCode } from "../localization/content";
import type { SearchContentSource } from "./index";

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

const LOCALE_FRONTMATTER_PATTERN = /\nlocale:\s*([^\n]+)\n/;

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

const getLocaleForModule = (raw: string): string | undefined => {
	const match = raw.match(LOCALE_FRONTMATTER_PATTERN);
	const normalized = normalizeLocaleCode(match?.[1]);
	return normalized ?? undefined;
};

const shouldIncludeModule = (
	raw: string,
	requestedLocale: string | null,
	defaultLocale: string,
): boolean => {
	if (!requestedLocale) return true;

	const moduleLocale = getLocaleForModule(raw);
	return moduleLocale
		? moduleLocale === requestedLocale
		: requestedLocale === defaultLocale;
};

export const createBookSearchSources = (
	modules: BookSearchModuleMap,
): SearchContentSource[] => {
	return defaultBookSearchSources.map((source) => ({
		...source,
		modules: modules[source.type],
	}));
};

export const createLocalizedSearchSources = (
	modules: BookSearchModuleMap,
	options: LocalizedSearchOptions,
): SearchContentSource[] => {
	const defaultLocale = normalizeLocaleCode(options.defaultLocale) ?? "default";
	const requestedLocale = normalizeLocaleCode(options.locale);

	return defaultBookSearchSources.map((source) => ({
		...source,
		modules: Object.fromEntries(
			Object.entries(modules[source.type]).filter(([, raw]) =>
				shouldIncludeModule(raw, requestedLocale, defaultLocale),
			),
		),
	}));
};

export type { BookSearchModuleMap, LocalizedSearchOptions };
