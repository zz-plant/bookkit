export type StudioValues = {
  bookTitle: string;
  bookKey: string;
  promise: string;
  audience: string;
  mechanisms: string[];
  chapters: string[];
  locales: string[];
  siteUrl: string;
  domains: string[];
  defaultMetaDescription: string;
  defaultOgImage: string;
  ogSiteName: string;
  ogLocale: string;
  ogImageAlt: string;
  twitterCard: string;
  indexable: boolean;
  ogSurfaces: Array<{ key: string; path: string }>;
};

export const toLines = (value: string) => value.split(/\r?\n|,/).map((entry) => entry.trim()).filter(Boolean);
export const toSlug = (value: string) => value.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-");
const prettyTitle = (value: string) => value.trim() || "Untitled Book";
const normalizeSiteUrl = (value: string, bookKey: string) => {
  const trimmed = value.trim();
  if (!trimmed) return `https://${bookKey}.book`;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};
const parseOgSurfaceLines = (value: string) => toLines(value).reduce<Array<{ key: string; path: string }>>((acc, entry) => {
  const separatorIndex = entry.indexOf("=");
  if (separatorIndex === -1) return acc;
  const key = toSlug(entry.slice(0, separatorIndex));
  const path = entry.slice(separatorIndex + 1).trim();
  if (!key || !path) return acc;
  acc.push({ key, path: path.startsWith("/") ? path : `/${path}` });
  return acc;
}, []);

export const normalizeInput = (formData: FormData): StudioValues => {
  const bookTitle = prettyTitle(String(formData.get("bookTitle") || ""));
  const bookKeyRaw = String(formData.get("bookKey") || "").trim();
  const bookKey = toSlug(bookKeyRaw || bookTitle || "new-book");
  return {
    bookTitle,
    bookKey,
    promise: String(formData.get("promise") || "").trim(),
    audience: String(formData.get("audience") || "").trim() || "General readers",
    mechanisms: toLines(String(formData.get("mechanisms") || "")).map(toSlug),
    chapters: toLines(String(formData.get("chapters") || "")).map(toSlug),
    locales: toLines(String(formData.get("locales") || "")).map((locale) => locale.toLowerCase()),
    siteUrl: normalizeSiteUrl(String(formData.get("siteUrl") || ""), bookKey),
    domains: toLines(String(formData.get("domains") || "")),
    defaultMetaDescription: String(formData.get("defaultMetaDescription") || "").trim() || String(formData.get("promise") || "").trim(),
    defaultOgImage: String(formData.get("defaultOgImage") || "").trim() || "/og/default.svg",
    ogSiteName: String(formData.get("ogSiteName") || "").trim() || bookTitle,
    ogLocale: String(formData.get("ogLocale") || "").trim() || "en_US",
    ogImageAlt: String(formData.get("ogImageAlt") || "").trim() || `${bookTitle} cover image`,
    twitterCard: String(formData.get("twitterCard") || "").trim() || "summary_large_image",
    indexable: formData.get("indexable") === "on",
    ogSurfaces: parseOgSurfaceLines(String(formData.get("ogSurfaces") || "")),
  };
};

export const buildConfig = ({ bookKey, bookTitle, audience, locales, siteUrl, domains, defaultMetaDescription, defaultOgImage, indexable }: StudioValues) => {
  const localeObjects = locales.length ? locales.map((locale, index) => ({ code: locale, label: locale.toUpperCase(), isDefault: index === 0 })) : [{ code: "en", label: "English", isDefault: true }];
  const defaultLocale = localeObjects.find((locale) => locale.isDefault)?.code ?? "en";
  const localeText = localeObjects.map((locale) => `      { code: "${locale.code}", label: "${locale.label}", isDefault: ${locale.isDefault}, completeness: ${locale.isDefault ? 1 : 0.5} },`).join("\n");
  return `export const bookConfig = {\n  slug: "${bookKey}",\n  title: "${bookTitle}",\n  status: "draft",\n  site: {\n    url: ${JSON.stringify(siteUrl)},\n    domains: ${JSON.stringify(domains)},\n    enforceHttps: true,\n    indexable: ${indexable},\n    defaultMeta: {\n      description: ${JSON.stringify(defaultMetaDescription)},\n      ogImage: ${JSON.stringify(defaultOgImage)},\n    },\n  },\n  localization: {\n    defaultLocale: "${defaultLocale}",\n    includeDefaultPrefix: false,\n    label: "Language",\n    locales: [\n${localeText}\n    ],\n  },\n} as const;\n\nexport default bookConfig;`;
};

export const buildSeoStarter = ({ ogSiteName, ogLocale, ogImageAlt, twitterCard, defaultOgImage, ogSurfaces }: StudioValues) => `export const seoOverrides = {\n  defaults: {\n    ogSiteName: ${JSON.stringify(ogSiteName)},\n    ogLocale: ${JSON.stringify(ogLocale)},\n    ogImageAlt: ${JSON.stringify(ogImageAlt)},\n    twitterCard: ${JSON.stringify(twitterCard)},\n    ogImage: ${JSON.stringify(defaultOgImage)},\n  },\n  pageTypeOgImage: ${JSON.stringify(Object.fromEntries(ogSurfaces.map((surface) => [surface.key, surface.path])), null, 2)},\n} as const;`;

export const buildOgUrlList = ({ siteUrl, defaultOgImage, ogSurfaces }: StudioValues) => {
  const absolutePath = (path: string) => { try { return new URL(path, siteUrl).toString(); } catch { return `${siteUrl.replace(/\/$/, "")}${path}`; } };
  return [`default => ${absolutePath(defaultOgImage)}`, ...ogSurfaces.map((surface) => `${surface.key} => ${absolutePath(surface.path)}`)].join("\n");
};

export const buildBrief = ({ bookTitle, promise, audience, chapters, mechanisms, locales }: StudioValues) => [
  `Title: ${bookTitle}`,
  `Promise: ${promise}`,
  `Audience: ${audience}`,
  `Chapter ideas: ${chapters.length ? chapters.join(", ") : "(to be defined)"}`,
  `Topic tags: ${mechanisms.length ? mechanisms.join(", ") : "(to be defined)"}`,
  `Languages: ${locales.length ? locales.join(", ") : "en"}`,
].join("\n");

export const buildChecklist = ({ bookKey, chapters, mechanisms, ogSurfaces }: StudioValues) => [
  "1. Run compile with auto-scaffold if the app does not exist.",
  `2. Set book slug to \"${bookKey}\" in book.config.ts.`,
  `3. ${chapters.length ? `Create starter chapter files for: ${chapters.join(", ")}.` : "Create at least one starter chapter file."}`,
  `4. ${mechanisms.length ? `Create starter mechanism files for: ${mechanisms.join(", ")}.` : "Create at least one starter mechanism file."}`,
  "5. Re-run compile after content edits and confirm no errors.",
  "6. Open the app locally and review /read pages.",
  `7. Create OG SVG assets for ${ogSurfaces.length || 1} page surface(s) and wire page-level seoProps.`,
].join("\n");

export const buildPayload = (values: StudioValues) => ({
  task: "bookkit.scaffold_book",
  book: { slug: values.bookKey, title: values.bookTitle, promise: values.promise, audience: values.audience, locales: values.locales.length ? values.locales : ["en"] },
  seo: {
    siteUrl: values.siteUrl, domains: values.domains, indexable: values.indexable, defaultMetaDescription: values.defaultMetaDescription, defaultOgImage: values.defaultOgImage, ogSiteName: values.ogSiteName, ogLocale: values.ogLocale, ogImageAlt: values.ogImageAlt, twitterCard: values.twitterCard, ogSurfaces: values.ogSurfaces,
  },
  contentSeeds: { mechanisms: values.mechanisms, chapters: values.chapters },
  acceptanceCriteria: ["book.config.ts exists and validates", "starter mechanisms include required frame fields", "starter chapters compile and appear in /read/chapters"],
  commands: {
    compile: `bun run compile:book -- --book ${values.bookKey} --create-if-missing --title ${JSON.stringify(values.bookTitle)}`,
    dev: `bun run dev:${values.bookKey}`,
  },
});

export const buildCommands = ({ bookKey, bookTitle }: StudioValues) => `bun run compile:book -- --book ${bookKey} --create-if-missing --title ${JSON.stringify(bookTitle)}\nbun run dev:${bookKey}`;
