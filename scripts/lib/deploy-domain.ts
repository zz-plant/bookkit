/**
 * Whether a book's Worker serves the domain its pages name as canonical.
 *
 * `site.url` drives every canonical link, the sitemap, and robots.txt. If the
 * Worker answers on another host, search engines are told the real pages live
 * somewhere else, possibly on a domain someone else owns. Custom domains are
 * declared in the app's wrangler.jsonc, so the check reads both files.
 */

type WranglerRoute = string | { pattern?: string; custom_domain?: boolean };

/** Strips // and block comments, ignoring comment markers inside strings. */
const stripJsonComments = (text: string): string =>
	text.replace(
		/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
		(_, string?: string) => string ?? "",
	);

/** Hosts the Worker is deployed to as custom domains or routes, from wrangler.jsonc. */
export const wranglerHosts = (wranglerJsonc: string): string[] => {
	let config: { routes?: WranglerRoute[]; route?: WranglerRoute };
	try {
		config = JSON.parse(stripJsonComments(wranglerJsonc));
	} catch {
		return [];
	}
	const routes = [
		...(config.routes ?? []),
		...(config.route ? [config.route] : []),
	];
	return routes
		.map((route) => (typeof route === "string" ? route : route.pattern))
		.filter((pattern): pattern is string => Boolean(pattern))
		.map((pattern) => pattern.replace(/^https?:\/\//, "").split(/[/*]/)[0])
		.filter(Boolean);
};

/**
 * A notice when `site.url`'s host is not one the Worker serves, else null.
 * Not an error: the first deploy usually goes to *.workers.dev, which
 * public/_headers keeps out of search.
 */
export const domainNotice = ({
	book,
	siteUrl,
	wranglerJsonc,
}: {
	book: string;
	siteUrl: string | undefined;
	wranglerJsonc: string;
}): string | null => {
	let host: string;
	try {
		host = new URL(siteUrl ?? "").host;
	} catch {
		return `site.url in apps/${book}/src/book.config.ts is not a URL, so canonical links have no domain.`;
	}
	if (wranglerHosts(wranglerJsonc).includes(host)) return null;
	return [
		`site.url is https://${host}, which this Worker does not serve. This deploy is reachable on *.workers.dev only, which stays out of search.`,
		`To publish on your domain, set site.url in apps/${book}/src/book.config.ts to it and add`,
		`  "routes": [{ "pattern": "<your domain>", "custom_domain": true }]`,
		`to apps/${book}/wrangler.jsonc. The domain's zone must be on your Cloudflare account; deploy attaches it.`,
	].join("\n");
};

/**
 * Where the book's live sitemap is, when that is known before publishing: at
 * site.url, if the Worker serves that host as a custom domain or route. A
 * *.workers.dev address depends on the Cloudflare account, which is not in
 * the repository, so then the reason is returned instead.
 */
export const liveSitemapUrl = ({
	siteUrl,
	wranglerJsonc,
}: {
	siteUrl: string | undefined;
	wranglerJsonc: string;
}): { url: string } | { unknown: string } => {
	let origin: string;
	let host: string;
	try {
		({ origin, host } = new URL(siteUrl ?? ""));
	} catch {
		return { unknown: "site.url is not a URL" };
	}
	if (!wranglerHosts(wranglerJsonc).includes(host)) {
		return {
			unknown: `the Worker does not serve site.url's host (${host}), and its *.workers.dev address depends on the Cloudflare account`,
		};
	}
	return { url: `${origin}/sitemap.xml` };
};
