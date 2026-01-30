import type { LocaleEntry } from "./routes";

type ContentFrontmatter = {
  slug?: string;
  locale?: string;
};

type ContentModule<TFrontmatter extends ContentFrontmatter = ContentFrontmatter> = {
  frontmatter?: TFrontmatter;
};

export type LocalizedContentIndex<TModule extends ContentModule = ContentModule> = {
  slugs: string[];
  bySlug: Record<string, Record<string, TModule>>;
  locales: string[];
  defaultLocale: string;
};

export type LocalizedContentResolution<TModule extends ContentModule = ContentModule> = {
  entries: Array<{
    slug: string;
    module: TModule;
    locale: string;
    isFallback: boolean;
  }>;
  bySlug: Record<string, TModule>;
  missingSlugs: string[];
  completeness: number | null;
};

type BuildLocalizedContentOptions = {
  defaultLocale?: string;
};

export const normalizeLocaleCode = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
};

const resolveSlugFromPath = (path: string): string => {
  return path.split("/").pop()?.replace(/\.mdx?$/, "") ?? path;
};

const resolveLocaleKey = (moduleLocale: string | null, defaultLocale: string): string => {
  return moduleLocale ?? defaultLocale;
};

export const buildLocalizedContentIndex = <TModule extends ContentModule = ContentModule>(
  modules: Record<string, TModule>,
  options: BuildLocalizedContentOptions = {}
): LocalizedContentIndex<TModule> => {
  const defaultLocale = normalizeLocaleCode(options.defaultLocale) ?? "default";
  const bySlug: Record<string, Record<string, TModule>> = {};
  const slugs: string[] = [];
  const localeSet = new Set<string>([defaultLocale]);

  Object.entries(modules)
    .sort(([pathA], [pathB]) => pathA.localeCompare(pathB))
    .forEach(([path, module]) => {
      const frontmatter = module.frontmatter;
      const slug = frontmatter?.slug ?? resolveSlugFromPath(path);
      if (!slug) return;
      if (!slugs.includes(slug)) slugs.push(slug);
      const moduleLocale = normalizeLocaleCode(frontmatter?.locale);
      const localeKey = resolveLocaleKey(moduleLocale, defaultLocale);
      localeSet.add(localeKey);
      if (!bySlug[slug]) bySlug[slug] = {};
      const existing = bySlug[slug][localeKey];
      if (!existing || moduleLocale) {
        bySlug[slug][localeKey] = module;
      }
    });

  return {
    slugs,
    bySlug,
    locales: Array.from(localeSet),
    defaultLocale,
  };
};

export const mergeLocaleCompleteness = (
  locales: LocaleEntry[],
  completeness: Record<string, number>
): LocaleEntry[] => {
  return locales.map((entry) => {
    if (typeof entry.completeness === "number") return entry;
    const localeKey = normalizeLocaleCode(entry.code) ?? entry.code;
    const computed = completeness[localeKey];
    return typeof computed === "number" ? { ...entry, completeness: computed } : entry;
  });
};

export const resolveLocalizedContent = <TModule extends ContentModule = ContentModule>(
  index: LocalizedContentIndex<TModule>,
  options: { locale?: string }
): LocalizedContentResolution<TModule> => {
  const localeKey = normalizeLocaleCode(options.locale);
  const entries: LocalizedContentResolution<TModule>["entries"] = [];
  const bySlug: Record<string, TModule> = {};
  const missingSlugs: string[] = [];

  index.slugs.forEach((slug) => {
    const localeMap = index.bySlug[slug] ?? {};
    const localizedModule = localeKey ? localeMap[localeKey] : undefined;
    const defaultModule = localeMap[index.defaultLocale];
    const fallbackModule = defaultModule ?? localeMap[Object.keys(localeMap)[0] ?? ""];
    const module = localizedModule ?? fallbackModule;
    if (!module) return;
    const resolvedLocale =
      (localeKey && localizedModule && localeKey) ||
      (defaultModule && index.defaultLocale) ||
      Object.keys(localeMap)[0] ||
      index.defaultLocale;
    const isFallback = Boolean(localeKey && !localizedModule);
    if (localeKey && !localizedModule) missingSlugs.push(slug);
    entries.push({ slug, module, locale: resolvedLocale, isFallback });
    bySlug[slug] = module;
  });

  const completeness =
    localeKey && index.slugs.length
      ? Math.min(1, Math.max(0, (index.slugs.length - missingSlugs.length) / index.slugs.length))
      : null;

  return {
    entries,
    bySlug,
    missingSlugs,
    completeness,
  };
};

export const resolveLocalizedModule = <TModule extends ContentModule = ContentModule>(
  index: LocalizedContentIndex<TModule>,
  slug: string,
  options: { locale?: string }
): TModule | null => {
  const localeKey = normalizeLocaleCode(options.locale);
  const localeMap = index.bySlug[slug];
  if (!localeMap) return null;
  if (localeKey && localeMap[localeKey]) return localeMap[localeKey];
  if (localeMap[index.defaultLocale]) return localeMap[index.defaultLocale];
  return localeMap[Object.keys(localeMap)[0] ?? ""] ?? null;
};

export const calculateLocaleCompleteness = <TModule extends ContentModule = ContentModule>(
  indexes: Array<LocalizedContentIndex<TModule>>,
  options: { locales?: string[] } = {}
): Record<string, number> => {
  const localeKeys = new Set<string>(
    (options.locales ?? []).map((locale) => normalizeLocaleCode(locale)).filter(Boolean) as string[]
  );

  if (!localeKeys.size) {
    indexes.forEach((index) => index.locales.forEach((locale) => localeKeys.add(locale)));
  }

  const totals: Record<string, { translated: number; total: number }> = {};
  localeKeys.forEach((locale) => {
    totals[locale] = { translated: 0, total: 0 };
  });

  indexes.forEach((index) => {
    index.slugs.forEach((slug) => {
      localeKeys.forEach((locale) => {
        totals[locale].total += 1;
        if (index.bySlug[slug]?.[locale]) totals[locale].translated += 1;
      });
    });
  });

  return Object.fromEntries(
    Object.entries(totals).map(([locale, { translated, total }]) => [
      locale,
      total ? Math.min(1, Math.max(0, translated / total)) : 0,
    ])
  );
};
