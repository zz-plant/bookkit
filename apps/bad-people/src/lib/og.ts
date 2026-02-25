const OG_SURFACE_IMAGE_MAP = {
  home: "/og/home.svg",
  readHub: "/og/read-hub.svg",
  overview: "/og/overview.svg",
  chapters: "/og/chapters.svg",
  chapterDetail: "/og/chapter-detail.svg",
  mechanisms: "/og/mechanisms.svg",
  mechanismDetail: "/og/mechanism-detail.svg",
  toolkit: "/og/toolkit.svg",
  toolkitDetail: "/og/toolkit-detail.svg",
  glossary: "/og/glossary.svg",
  glossaryDetail: "/og/glossary-detail.svg",
  examples: "/og/examples.svg",
  exampleDetail: "/og/example-detail.svg",
  releaseNotes: "/og/release-notes.svg",
  versions: "/og/versions.svg",
  downloads: "/og/downloads.svg",
  fallback: "/og/default.svg",
} as const;

const LOCALE_PREFIX_PATTERN = /^\/[a-z]{2}(?:-[a-z]{2})?(?=\/|$)/i;

const normalizePath = (pathname: string): string => {
  if (!pathname) return "/";
  const withoutLocale = pathname.replace(LOCALE_PREFIX_PATTERN, "") || "/";
  if (withoutLocale.length > 1 && withoutLocale.endsWith("/")) {
    return withoutLocale.slice(0, -1);
  }
  return withoutLocale;
};

export const getOgImageForPath = (pathname: string): string => {
  const path = normalizePath(pathname);

  if (path === "/") return OG_SURFACE_IMAGE_MAP.home;
  if (path === "/read") return OG_SURFACE_IMAGE_MAP.readHub;
  if (path === "/read/overview") return OG_SURFACE_IMAGE_MAP.overview;
  if (path === "/read/chapters") return OG_SURFACE_IMAGE_MAP.chapters;
  if (path.startsWith("/read/chapters/")) return OG_SURFACE_IMAGE_MAP.chapterDetail;
  if (path === "/read/mechanisms") return OG_SURFACE_IMAGE_MAP.mechanisms;
  if (path.startsWith("/read/mechanisms/")) return OG_SURFACE_IMAGE_MAP.mechanismDetail;
  if (path === "/read/toolkit") return OG_SURFACE_IMAGE_MAP.toolkit;
  if (path.startsWith("/read/toolkit/")) return OG_SURFACE_IMAGE_MAP.toolkitDetail;
  if (path === "/read/glossary") return OG_SURFACE_IMAGE_MAP.glossary;
  if (path.startsWith("/read/glossary/")) return OG_SURFACE_IMAGE_MAP.glossaryDetail;
  if (path === "/read/examples") return OG_SURFACE_IMAGE_MAP.examples;
  if (path.startsWith("/read/examples/")) return OG_SURFACE_IMAGE_MAP.exampleDetail;
  if (path === "/release-notes") return OG_SURFACE_IMAGE_MAP.releaseNotes;
  if (path === "/versions") return OG_SURFACE_IMAGE_MAP.versions;
  if (path === "/downloads") return OG_SURFACE_IMAGE_MAP.downloads;

  return OG_SURFACE_IMAGE_MAP.fallback;
};
