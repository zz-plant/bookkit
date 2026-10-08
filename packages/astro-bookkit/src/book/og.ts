import { normalizeOgPathname, ogImagePathFor } from "../seo/og-image";

export { normalizeOgPathname };

/**
 * A page's link-preview image: the PNG the Bookkit integration renders for it
 * at build time (`/og/index.png` for the home page, else `/og/<path>.png`).
 * A page that passes its own `ogImage` keeps it.
 */
export const getOgImageForPath = (pathname: string): string =>
	ogImagePathFor(pathname);
