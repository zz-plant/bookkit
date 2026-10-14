import { shortBookTitle } from "./page-meta";

/**
 * Link-preview images. Every built page gets its own 1200×630 PNG, set in the
 * book's two voices (Newsreader for the page, Fragment Mono for the
 * apparatus) on the book's paper. Social sites do not render SVG previews, so
 * these are rasterized at build time by the Bookkit integration.
 *
 * The card reads what the page already says about itself (its Open Graph
 * tags), so a page's preview, title, and description cannot disagree.
 */

export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
/** Where generated images live in the built site. */
export const OG_IMAGE_DIRECTORY = "og";

/** Base for resolving relative URLs when a page names no origin. */
const PLACEHOLDER_ORIGIN = "https://bookkit.invalid";

const LOCALE_PREFIX_PATTERN = /^\/[a-z]{2}(?:-[a-z]{2})?(?=\/|$)/i;

/** A page path without its locale prefix or trailing slash. */
export const normalizeOgPathname = (pathname: string): string => {
	if (!pathname) return "/";
	const withoutLocale = pathname.replace(LOCALE_PREFIX_PATTERN, "") || "/";
	if (withoutLocale.length > 1 && withoutLocale.endsWith("/")) {
		return withoutLocale.slice(0, -1);
	}
	return withoutLocale;
};

/**
 * The preview image for a page: `/og/index.png` for the home page, else
 * `/og/<page path>.png`. Locales share the default locale's image.
 */
export const ogImagePathFor = (pathname: string): string => {
	const path = normalizeOgPathname(pathname);
	return `/${OG_IMAGE_DIRECTORY}${path === "/" ? "/index" : path}.png`;
};

/** The apparatus label over a detail page's title. Index pages need none. */
const SECTION_LABELS: Array<[RegExp, string]> = [
	[/^\/read\/chapters\/.+/, "Chapter"],
	[/^\/read\/mechanisms\/.+/, "Mechanism"],
	[/^\/read\/toolkit\/.+/, "Tool"],
	[/^\/read\/glossary\/.+/, "Glossary"],
	[/^\/read\/examples\/.+/, "Example"],
];

export const ogSectionLabel = (pathname: string): string | undefined => {
	const path = normalizeOgPathname(pathname);
	return SECTION_LABELS.find(([pattern]) => pattern.test(path))?.[1];
};

export type OgCard = {
	/** Apparatus label, e.g. "Chapter". */
	label?: string;
	title: string;
	description?: string;
	/** The book's short title, set as the running foot. */
	book: string;
	/** The byline, from `bookConfig.author`. */
	author?: string;
	/** The site's host, e.g. "on-call.book". */
	host?: string;
};

const decodeEntities = (value: string): string =>
	value
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&#x27;/g, "'")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&");

export const metaContent = (html: string, key: string): string | undefined => {
	const tag = html.match(
		new RegExp(`<meta[^>]+(?:property|name)="${key}"[^>]*>`, "i"),
	)?.[0];
	const content = tag?.match(/content="([^"]*)"/i)?.[1];
	return content === undefined ? undefined : decodeEntities(content);
};

/**
 * The page's own name: its title without the " • <book>" suffix, whether the
 * suffix is the short title or the full one that starts with it.
 */
const pageTitleFrom = (title: string, shortTitle: string): string => {
	const at = title.indexOf(` • ${shortTitle}`);
	return at > 0 ? title.slice(0, at) : title;
};

/** Whether an image URL is one Bookkit generates, rather than an author's own file. */
export const isGeneratedOgImage = (image: string | undefined): boolean => {
	if (!image) return false;
	try {
		const { pathname } = new URL(image, PLACEHOLDER_ORIGIN);
		return (
			pathname.startsWith(`/${OG_IMAGE_DIRECTORY}/`) &&
			pathname.endsWith(".png")
		);
	} catch {
		return false;
	}
};

/** The page path a built HTML file serves: `read/index.html` → `/read`. */
export const pagePathForFile = (file: string): string => {
	const path = file
		.replace(/\\/g, "/")
		.replace(/(^|\/)index\.html$/, "")
		.replace(/\.html$/, "");
	return `/${path}`;
};

/**
 * The card for a built page, from its Open Graph tags. `pagePath` stands in
 * for a missing `og:url`. Null when the page has no title or image, or when
 * its image is not the one Bookkit generates for that page (an author's own
 * `ogImage`).
 */
export const ogCardFromHtml = (
	html: string,
	pagePath?: string,
): { imagePath: string; card: OgCard } | null => {
	const image = metaContent(html, "og:image");
	const title = metaContent(html, "og:title");
	if (!image || !title) return null;
	const pageUrl = metaContent(html, "og:url");
	if (!pageUrl && !pagePath) return null;
	let imagePath: string;
	let page: URL;
	try {
		// Without og:url, an absolute image URL still names the site's host.
		page = pageUrl
			? new URL(pageUrl)
			: new URL(pagePath ?? "/", new URL(image, PLACEHOLDER_ORIGIN));
		imagePath = new URL(image, page).pathname;
	} catch {
		return null;
	}
	if (imagePath !== ogImagePathFor(page.pathname)) return null;
	const book = shortBookTitle(metaContent(html, "og:site_name") ?? title);
	const isHome = normalizeOgPathname(page.pathname) === "/";
	return {
		imagePath,
		card: {
			label: ogSectionLabel(page.pathname),
			// The home page's title is the book's full title.
			title: isHome ? title : pageTitleFrom(title, book),
			description: metaContent(html, "og:description"),
			book,
			author: metaContent(html, "author"),
			host: page.origin === PLACEHOLDER_ORIGIN ? undefined : page.host,
		},
	};
};

const PAPER = "#f7f4ed";
const INK = "#1d1b17";
const RUBRIC = "#a3301c";
// Ink mixed toward paper, as bookkit.css does with color-mix.
const MUTED = "#6b6862";
const RULE = "#bdb9b1";

/** Display size steps down as the title grows, so long titles still fit three lines. */
export const ogTitleSize = (title: string): number => {
	const length = [...title].length;
	if (length <= 32) return 76;
	if (length <= 60) return 64;
	if (length <= 90) return 52;
	return 44;
};

type Node = {
	type: string;
	props: { style?: Record<string, unknown>; children?: unknown };
};

const h = (
	type: string,
	style: Record<string, unknown>,
	children?: unknown,
): Node => ({ type, props: { style, children } });

/** The satori element tree for a card. Exported for tests. */
export const ogCardTree = (card: OgCard): Node =>
	h(
		"div",
		{
			width: "100%",
			height: "100%",
			display: "flex",
			flexDirection: "column",
			backgroundColor: PAPER,
			color: INK,
			padding: "72px 84px 60px",
			fontFamily: "Newsreader",
		},
		[
			h(
				"div",
				{
					display: "flex",
					fontFamily: "Fragment Mono",
					fontSize: 24,
					color: RUBRIC,
					height: 32,
				},
				card.label ?? "",
			),
			h(
				"div",
				{
					display: "block",
					marginTop: 20,
					fontSize: ogTitleSize(card.title),
					fontWeight: 500,
					lineHeight: 1.08,
					letterSpacing: "-0.01em",
					lineClamp: 3,
				},
				card.title,
			),
			card.description
				? h(
						"div",
						{
							display: "block",
							marginTop: 28,
							fontSize: 30,
							lineHeight: 1.35,
							color: MUTED,
							lineClamp: 3,
						},
						card.description,
					)
				: h("div", { display: "flex" }),
			h("div", { display: "flex", flexGrow: 1 }),
			h(
				"div",
				{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "baseline",
					borderTop: `1px solid ${RULE}`,
					paddingTop: 22,
				},
				[
					h("div", { display: "flex", alignItems: "baseline", fontSize: 28 }, [
						h("span", { fontStyle: "italic" }, card.book),
						card.author
							? h("span", { color: MUTED, marginLeft: 14 }, `by ${card.author}`)
							: h("span", {}, ""),
					]),
					h(
						"div",
						{
							display: "flex",
							fontFamily: "Fragment Mono",
							fontSize: 22,
							color: MUTED,
						},
						card.host ?? "",
					),
				],
			),
		],
	);
