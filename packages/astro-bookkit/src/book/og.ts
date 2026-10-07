export const DEFAULT_OG_SURFACE_IMAGE_MAP = {
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

export const normalizeOgPathname = (pathname: string): string => {
	if (!pathname) return "/";
	const withoutLocale = pathname.replace(LOCALE_PREFIX_PATTERN, "") || "/";
	if (withoutLocale.length > 1 && withoutLocale.endsWith("/")) {
		return withoutLocale.slice(0, -1);
	}
	return withoutLocale;
};

export const getOgImageForPath = (
	pathname: string,
	surfaceImageMap: typeof DEFAULT_OG_SURFACE_IMAGE_MAP = DEFAULT_OG_SURFACE_IMAGE_MAP,
): string => {
	const path = normalizeOgPathname(pathname);

	if (path === "/") return surfaceImageMap.home;
	if (path === "/read") return surfaceImageMap.readHub;
	if (path === "/read/overview") return surfaceImageMap.overview;
	if (path === "/read/chapters") return surfaceImageMap.chapters;
	if (path.startsWith("/read/chapters/")) return surfaceImageMap.chapterDetail;
	if (path === "/read/mechanisms") return surfaceImageMap.mechanisms;
	if (path.startsWith("/read/mechanisms/"))
		return surfaceImageMap.mechanismDetail;
	if (path === "/read/toolkit") return surfaceImageMap.toolkit;
	if (path.startsWith("/read/toolkit/")) return surfaceImageMap.toolkitDetail;
	if (path === "/read/glossary") return surfaceImageMap.glossary;
	if (path.startsWith("/read/glossary/")) return surfaceImageMap.glossaryDetail;
	if (path === "/read/examples") return surfaceImageMap.examples;
	if (path.startsWith("/read/examples/")) return surfaceImageMap.exampleDetail;
	if (path === "/release-notes") return surfaceImageMap.releaseNotes;
	if (path === "/versions") return surfaceImageMap.versions;
	if (path === "/downloads") return surfaceImageMap.downloads;

	return surfaceImageMap.fallback;
};
