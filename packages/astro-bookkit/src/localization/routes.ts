export type LocaleEntry = {
  code: string;
  label?: string;
  isDefault?: boolean;
  completeness?: number;
};

export type LocaleRoutingOptions = {
  defaultLocale?: string;
  includeDefaultPrefix?: boolean;
};

const normalizePath = (pathname: string): string => {
  if (!pathname) return "/";
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
};

export const resolveLocaleConfig = (
  locales: readonly LocaleEntry[],
  options: LocaleRoutingOptions = {}
): { defaultLocale?: string } => {
  const fallback = locales.find((entry) => entry.isDefault)?.code ?? locales[0]?.code;
  return { defaultLocale: options.defaultLocale ?? fallback };
};

export const stripLocaleFromPath = (
  pathname: string,
  localeCodes: string[],
  options: LocaleRoutingOptions = {}
): { locale: string | null; pathWithoutLocale: string } => {
  const normalized = normalizePath(pathname);
  const segments = normalized.split("/").filter(Boolean);
  const head = segments[0];
  if (head && localeCodes.includes(head)) {
    const rest = segments.slice(1).join("/");
    return { locale: head, pathWithoutLocale: `/${rest}` || "/" };
  }
  if (options.includeDefaultPrefix && options.defaultLocale && head === options.defaultLocale) {
    const rest = segments.slice(1).join("/");
    return { locale: options.defaultLocale, pathWithoutLocale: `/${rest}` || "/" };
  }
  return { locale: null, pathWithoutLocale: normalized };
};

export const buildLocalePath = (
  pathname: string,
  locale: string,
  options: LocaleRoutingOptions = {}
): string => {
  const normalized = normalizePath(pathname);
  const shouldPrefix = options.includeDefaultPrefix || locale !== options.defaultLocale;
  if (!shouldPrefix) {
    return normalized;
  }
  const trimmed = normalized === "/" ? "" : normalized;
  return `/${locale}${trimmed}`;
};

export const formatLocaleLabel = (entry: LocaleEntry): string =>
  entry.label ?? entry.code.toUpperCase();
