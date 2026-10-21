import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import {
	inspectEpub,
	inspectPdf,
} from "../../packages/astro-bookkit/src/exports/inspect";
import { AUTHOR_ONLY_PATHS } from "../../packages/astro-bookkit/src/seo/book";
import { decodeEntities } from "../../packages/astro-bookkit/src/utils/character-references";
import {
	attributeRefusal,
	CONTENT_ELEMENTS,
	elementReason,
	refusalReason,
} from "../../packages/astro-bookkit/src/utils/html-allowlist";

/**
 * Verifies that a book's `dist/` is something a public host can serve.
 *
 * Astro runs middleware while prerendering, so a misconfigured book can build
 * "successfully" into a tree of lockout or 404 pages. `astro build` exits 0
 * either way; this is the check that notices.
 */

export type BuildFindingLevel = "error" | "warning";

export type BuildFinding = {
	level: BuildFindingLevel;
	message: string;
	file?: string;
};

export type BuildInspection = {
	book: string;
	distDir: string;
	ok: boolean;
	pageCount: number;
	findings: BuildFinding[];
};

export type InspectBuildOptions = {
	book: string;
	distDir: string;
	/**
	 * `true` for a published or stable book, whose pages must be indexable;
	 * `false` for any other status, whose pages must be noindex. Unset: the
	 * book's status is unknown and indexing is not checked.
	 */
	published?: boolean;
	/** previewAccess is on although the site has no server runtime to check tokens. */
	previewAccessOnStaticSite?: boolean;
	/** The book is past draft, so it must have built at least one chapter page. */
	requireChapters?: boolean;
	/** `false` when book.config.ts turns the PDF off (`exports.pdf: false`), so no book.pdf is expected. */
	pdf?: boolean;
};

/** Present in every page the preview-access middleware renders instead of content. */
export const LOCKOUT_MARKER = "preview required</title>";

const REQUIRED_FILES = [
	"index.html",
	"404.html",
	"robots.txt",
	"sitemap.xml",
	"search-index.json",
	"release-notes.xml",
	"exports/book.epub",
] as const;

/** How many of a file's problems a finding lists. */
const LISTED_PROBLEMS = 5;

/**
 * What is wrong with one built export, from the engine's structural checks:
 * the EPUB's container, package, manifest, links, and XHTML; the PDF's pages
 * and text.
 */
const inspectExport = async (
	file: string,
	book: string,
): Promise<string | null> => {
	const bytes = new Uint8Array(readFileSync(file));
	const pdf = extname(file) === ".pdf";
	const problems = pdf ? await inspectPdf(bytes) : await inspectEpub(bytes);
	if (problems.length === 0) return null;
	const listed = problems.slice(0, LISTED_PROBLEMS).join("; ");
	const more =
		problems.length > LISTED_PROBLEMS
			? `; and ${problems.length - LISTED_PROBLEMS} more`
			: "";
	const fix = readHead(file, 64).trimStart().startsWith("<")
		? "It holds an HTML page: the export route rendered a page (usually an error page) instead of the file."
		: `Rebuild with \`bun run bookkit build ${book}\`; if the file is still broken, report it as a Bookkit bug with this message.`;
	return `Is not a usable ${pdf ? "PDF" : "EPUB"}: ${listed}${more}. ${fix}`;
};

const SCANNED_EXTENSIONS = new Set([
	".html",
	".pdf",
	".epub",
	".xml",
	".txt",
	".json",
]);
const SCAN_BYTES = 4096;
const SKIPPED_DIRECTORIES = new Set(["_astro"]);

const walk = (dir: string, out: string[] = []): string[] => {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (!SKIPPED_DIRECTORIES.has(entry.name)) walk(path, out);
		} else if (entry.isFile()) {
			out.push(path);
		}
	}
	return out;
};

const hostOf = (url: string | undefined): string | null => {
	if (!url) return null;
	try {
		return new URL(url).host;
	} catch {
		return null;
	}
};

const readHead = (file: string, bytes: number): string =>
	readFileSync(file).subarray(0, bytes).toString("utf8");

const RAW_TYPESCRIPT = /\.(ts|tsx|mts|cts)$/;

/** The built page a URL path is served from, if one exists. */
const pageFileFor = (distDir: string, pathname: string): string | null => {
	const clean = decodeURIComponent(pathname).replace(/^\/+|\/+$/g, "");
	const candidates = clean
		? [join(clean, "index.html"), `${clean}.html`]
		: ["index.html"];
	for (const candidate of candidates) {
		const path = join(distDir, candidate);
		if (existsSync(path)) return path;
	}
	return null;
};

const canonicalOf = (html: string): string | undefined =>
	html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];

/**
 * Pages that show a book's content (a template's `<Content />`): a
 * chapter, mechanism, tool, glossary term, or example, under any locale
 * prefix, built as `x/index.html` or `x.html`; and the release notes.
 */
const READ_PAGE =
	/(?:^|\/)read\/(?:chapters|mechanisms|toolkit|glossary|examples)\/(?!index\.html$).+\.html$/;
const RELEASE_NOTES_PAGE = /(?:^|\/)release-notes(?:\/index)?\.html$/;

/** Whether a built page (its path in dist/) shows a book's content. */
export const showsContent = (rel: string): boolean =>
	READ_PAGE.test(rel) || RELEASE_NOTES_PAGE.test(rel);

/**
 * The start tag of the section each page template wraps `<Content />` in:
 * a chapter's, and every other page's. A tool's page also writes sections
 * of its own this way, from its frontmatter; they are read too, and hold
 * only HTML content may.
 */
const CONTENT_SECTION =
	/<section class="content-block(?:"| chapter-content" data-chapter-sections)>/g;
const SECTION_TAG = /<(\/?)section\b[^>]*>/g;

/** What each content section holds: from its start tag to its `</section>`, footnotes' own section included. */
export const contentRegions = (html: string): string[] =>
	[...html.matchAll(CONTENT_SECTION)].map((match) => {
		const start = (match.index ?? 0) + match[0].length;
		SECTION_TAG.lastIndex = start;
		let depth = 1;
		for (let tag = SECTION_TAG.exec(html); tag; tag = SECTION_TAG.exec(html)) {
			depth += tag[1] ? -1 : 1;
			if (depth === 0) return html.slice(start, tag.index);
		}
		return html.slice(start);
	});

const PAGE_TAG =
	/<([A-Za-z][\w:-]*)((?:\s+[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/g;
const PAGE_ATTRIBUTE =
	/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

/** The inline colors Shiki gives a code block and its spans: color declarations, nothing that positions, covers, or loads. */
const SHIKI_STYLE =
	/^(?:\s*(?:color|background-color|font-style|font-weight|text-decoration|overflow-x|--shiki-[\w-]+)\s*:\s*[#\w\s.%,-]+;?)+\s*$/i;

/**
 * What the site's own Markdown writes that raw HTML may not (Astro's
 * defaults): Shiki's highlighting on a code block, a table column's
 * alignment, footnotes' `data-*` hooks, and a task list's checkbox.
 */
const writtenByMarkdown = (
	element: string,
	name: string,
	value: string,
): boolean => {
	switch (element) {
		case "pre":
			return (
				(name === "style" && SHIKI_STYLE.test(value)) ||
				(name === "tabindex" && value === "0") ||
				(name === "data-language" && /^[\w#+.-]*$/.test(value))
			);
		case "span":
			return name === "style" && SHIKI_STYLE.test(value);
		case "td":
		case "th":
			return (
				name === "style" &&
				/^text-align:\s*(?:left|center|right);?$/.test(value)
			);
		case "section":
			return name === "data-footnotes";
		case "a":
			return name === "data-footnote-ref" || name === "data-footnote-backref";
		case "input":
			return (
				(name === "type" && value === "checkbox") ||
				name === "disabled" ||
				name === "checked"
			);
		default:
			return false;
	}
};

const shortValue = (value: string): string =>
	value.length > 60 ? `${value.slice(0, 59)}…` : value;

/**
 * What a content section holds that a book's content may not hold
 * (`html-allowlist.ts`), each as `<img onerror="alert(1)">, which …`. The
 * site's Markdown step leaves all of it out, so this finds only what
 * reached the page after that step.
 */
export const contentMarkupProblems = (region: string): string[] => {
	const problems = new Set<string>();
	for (const [, rawElement, rawAttributes = ""] of region.matchAll(PAGE_TAG)) {
		const element = rawElement.toLowerCase();
		const attributes = [...rawAttributes.matchAll(PAGE_ATTRIBUTE)].map(
			([, name, double, single, bare]) => ({
				name: name.toLowerCase(),
				value: decodeEntities(double ?? single ?? bare ?? ""),
			}),
		);
		const checkbox =
			element === "input" &&
			attributes.some(
				({ name, value }) => name === "type" && value === "checkbox",
			) &&
			attributes.some(({ name }) => name === "disabled");
		if (!CONTENT_ELEMENTS.has(element) && !checkbox) {
			problems.add(`<${element}>, since ${elementReason(element)}`);
			continue;
		}
		for (const { name, value } of attributes) {
			if (writtenByMarkdown(element, name, value)) continue;
			const refusal = attributeRefusal(element, name, value);
			if (!refusal) continue;
			const shown = value
				? `<${element} ${name}="${shortValue(value)}">`
				: `<${element} ${name}>`;
			problems.add(
				`${shown}, since ${refusalReason(refusal, element, name, value)}`,
			);
		}
	}
	return [...problems];
};

/**
 * What check:build says of a built page's content: an error when it holds
 * HTML the allowlist refuses, and a warning when a page that shows content
 * has no content section to read. The engine's own chrome and scripts,
 * outside those sections, are not content.
 */
export const pageContentFindings = (
	rel: string,
	html: string,
): BuildFinding[] => {
	if (!showsContent(rel)) return [];
	const regions = contentRegions(html);
	if (regions.length === 0) {
		// The release notes have none when no release has notes of its own.
		return READ_PAGE.test(rel)
			? [
					{
						level: "warning",
						file: rel,
						message:
							"Shows the book's content, but holds no <section class=\"content-block\"> around it, so check:build could not check that content's HTML. The engine's page templates (packages/astro-bookkit/templates/book-app/src/pages/read) wrap <Content /> in one; restore it in this page's template.",
					},
				]
			: [];
	}
	const problems = [...new Set(regions.flatMap(contentMarkupProblems))];
	if (problems.length === 0) return [];
	const listed = problems.slice(0, LISTED_PROBLEMS).join("; ");
	const more =
		problems.length > LISTED_PROBLEMS
			? `; and ${problems.length - LISTED_PROBLEMS} more`
			: "";
	return [
		{
			level: "error",
			file: rel,
			message: `Its content holds HTML a book's content may not: ${listed}${more}. The site's Markdown step leaves such HTML out of every page it builds, so something added it after that step: a Markdown, MDX, or rehype plugin in astro.config.mjs, or a Bookkit bug to report with this message.`,
		},
	];
};

export const inspectBuildOutput = async ({
	book,
	distDir,
	published,
	previewAccessOnStaticSite = false,
	requireChapters = false,
	pdf = true,
}: InspectBuildOptions): Promise<BuildInspection> => {
	const findings: BuildFinding[] = [];
	const error = (message: string, file?: string) =>
		findings.push({ level: "error", message, file });
	const warning = (message: string, file?: string) =>
		findings.push({ level: "warning", message, file });

	if (!existsSync(distDir) || !statSync(distDir).isDirectory()) {
		error(
			`No build output found. Run \`bun run bookkit build ${book}\` first.`,
		);
		return { book, distDir, ok: false, pageCount: 0, findings };
	}

	for (const rel of pdf
		? [...REQUIRED_FILES, "exports/book.pdf"]
		: REQUIRED_FILES) {
		if (!existsSync(join(distDir, rel))) {
			error(
				rel === "exports/book.pdf"
					? "Expected file is missing from the build output. If the book has no PDF on purpose, set exports: { pdf: false } in book.config.ts."
					: "Expected file is missing from the build output.",
				rel,
			);
		}
	}

	const files = walk(distDir);
	const pageCount = files.filter((file) => file.endsWith(".html")).length;

	if (previewAccessOnStaticSite) {
		error(
			'previewAccess is enabled in book.config.ts, but this is a static build: nothing checks preview tokens, so every page here is public. Set previewAccess.enabled to false (a book whose status is draft or in-review is already kept out of search), or serve the book with an adapter that enforces tokens and set site.runtime to "server".',
		);
	}

	if (requireChapters) {
		const chapterPages = files.filter((file) =>
			/^read\/chapters\/[^/]+(?:\/index)?\.html$/.test(
				relative(distDir, file).split("\\").join("/"),
			),
		);
		if (chapterPages.length === 0) {
			error(
				'No chapter pages were built, so the site has nothing to read. Add a chapter, or set status: "draft" in book.config.ts until the book has one.',
				"read/chapters/",
			);
		}
	}

	for (const file of files) {
		if (!SCANNED_EXTENSIONS.has(extname(file))) continue;
		if (readHead(file, SCAN_BYTES).includes(LOCKOUT_MARKER)) {
			error(
				"Rendered as a preview lockout page, so every visitor would be locked out. Disable previewAccess in book.config.ts or fix its tokens.",
				relative(distDir, file),
			);
		}
	}

	// Every PDF and EPUB, the book's and each chapter's, must open.
	const exportFiles = files
		.map((file) => relative(distDir, file).split("\\").join("/"))
		.filter((rel) => /^exports\/.+\.(pdf|epub)$/.test(rel))
		.sort();
	for (const rel of exportFiles) {
		const problem = await inspectExport(join(distDir, rel), book);
		if (problem) error(problem, rel);
	}

	// A host serves .json files as application/json, so one holding a page (a
	// route that rendered the 404 page) breaks every client that parses it.
	for (const file of files) {
		if (extname(file) !== ".json") continue;
		try {
			JSON.parse(readFileSync(file, "utf8"));
		} catch {
			const head = readHead(file, 64).trimStart().toLowerCase();
			error(
				head.startsWith("<")
					? "Holds an HTML page, not JSON. Its route rendered a page (usually the 404 page) instead of returning JSON; fix the route, or keep it out of a static build."
					: "Is not valid JSON. Fix the route that writes it.",
				relative(distDir, file),
			);
		}
	}

	const indexPath = join(distDir, "index.html");
	if (existsSync(indexPath)) {
		const html = readFileSync(indexPath, "utf8");
		const title = html.match(/<title>([^<]*)<\/title>/)?.[1]?.trim();
		if (!title) error("Has no <title>.", "index.html");

		const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
		if (!canonical) {
			error(
				"Has no canonical link. Set site.url in book.config.ts.",
				"index.html",
			);
		}

		const noindex = /<meta name="robots" content="[^"]*noindex/.test(html);
		if (published === true && noindex) {
			error(
				"Is marked noindex although the book status is published or stable. Build with NODE_ENV=production and without BOOKKIT_NOINDEX, and do not set site.indexable to false.",
				"index.html",
			);
		}
		if (published === false && !noindex) {
			error(
				"Is indexable although the book status is not published or stable. An unreleased book must stay out of search: its layout should build every page noindex from bookConfig.status (run bun run check:shims).",
				"index.html",
			);
		}

		const hosts: Array<[string, string | null]> = [
			["index.html canonical", hostOf(canonical)],
		];
		const robotsPath = join(distDir, "robots.txt");
		if (existsSync(robotsPath)) {
			const host = readFileSync(robotsPath, "utf8").match(
				/^Host:\s*(\S+)/m,
			)?.[1];
			hosts.push(["robots.txt Host", host ?? null]);
		}
		const sitemapPath = join(distDir, "sitemap.xml");
		if (existsSync(sitemapPath)) {
			const loc = readFileSync(sitemapPath, "utf8").match(
				/<loc>([^<]+)<\/loc>/,
			)?.[1];
			hosts.push(["sitemap.xml <loc>", hostOf(loc)]);
		}
		const distinct = new Set(hosts.map(([, host]) => host).filter(Boolean));
		if (distinct.size > 1) {
			error(
				`Site URL disagrees across artifacts: ${hosts
					.map(([label, host]) => `${label} -> ${host ?? "(none)"}`)
					.join(", ")}. All of them derive from site.url in book.config.ts.`,
			);
		}
	}

	// Client code must be compiled. A `?url` import of a .ts module copies the
	// source as an asset, and browsers then fail to run it on every page.
	const assetsDir = join(distDir, "_astro");
	if (existsSync(assetsDir)) {
		for (const entry of readdirSync(assetsDir, { recursive: true })) {
			const rel = String(entry);
			if (RAW_TYPESCRIPT.test(rel) && !rel.endsWith(".d.ts")) {
				error(
					"Shipped as raw TypeScript, which browsers cannot run. Load client code from a processed <script> in the component (import the module inside it) instead of a `?url` import.",
					join("_astro", rel),
				);
			}
		}
	}
	for (const file of files) {
		if (!file.endsWith(".html")) continue;
		const html = readFileSync(file, "utf8");
		const script = html.match(
			/<script[^>]*\ssrc="([^"]+\.(?:ts|tsx|mts|cts))"/,
		)?.[1];
		if (script) {
			error(
				`Loads ${script}, a TypeScript file browsers cannot run. Bundle it through a processed <script> instead.`,
				relative(distDir, file),
			);
		}
	}

	// Every sitemap URL must be a built page whose canonical is that same URL;
	// otherwise search engines index a 404 or treat the two as different pages.
	const sitemapFile = join(distDir, "sitemap.xml");
	if (existsSync(sitemapFile)) {
		const locs = [
			...readFileSync(sitemapFile, "utf8").matchAll(/<loc>([^<]+)<\/loc>/g),
		].map((match) => match[1]);
		for (const loc of locs) {
			let pathname: string;
			try {
				pathname = new URL(loc).pathname;
			} catch {
				error(`Lists ${loc}, which is not an absolute URL.`, "sitemap.xml");
				continue;
			}
			const page = pageFileFor(distDir, pathname);
			if (!page) {
				error(
					`Lists ${pathname}, but no page was built for it, so search engines would find a 404. Build the page or drop the entry.`,
					"sitemap.xml",
				);
				continue;
			}
			const canonical = canonicalOf(readFileSync(page, "utf8"));
			if (canonical && canonical !== loc) {
				error(
					`Canonical ${canonical} differs from its sitemap URL ${loc}; search engines treat them as two pages. Derive both from the same path (no trailing slash).`,
					relative(distDir, page),
				);
			}
		}
	}

	// Search results must land on a built page, at the heading they name.
	const searchIndexFile = join(distDir, "search-index.json");
	if (existsSync(searchIndexFile)) {
		let entries: Array<{ url?: unknown }> = [];
		try {
			const parsed: unknown = JSON.parse(readFileSync(searchIndexFile, "utf8"));
			const list = Array.isArray(parsed)
				? parsed
				: (parsed as { entries?: unknown } | null)?.entries;
			entries = Array.isArray(list) ? list : [];
		} catch {
			error("Is not valid JSON.", "search-index.json");
		}
		const pages = new Map<string, string | null>();
		const broken: string[] = [];
		for (const entry of entries) {
			if (typeof entry.url !== "string" || !entry.url.startsWith("/")) continue;
			const [path, fragment] = entry.url.split("#");
			if (!pages.has(path)) {
				const page = pageFileFor(distDir, path);
				pages.set(path, page ? readFileSync(page, "utf8") : null);
			}
			const html = pages.get(path);
			if (html === null || html === undefined) {
				broken.push(`${entry.url} (no page)`);
			} else if (fragment && !html.includes(`id="${fragment}"`)) {
				broken.push(`${entry.url} (no heading with that id)`);
			}
		}
		if (broken.length > 0) {
			error(
				`${broken.length} search result link(s) lead nowhere: ${broken.slice(0, 5).join(", ")}${broken.length > 5 ? ", …" : ""}. Search URLs must use the read routes' slugs and the page's heading ids.`,
				"search-index.json",
			);
		}
	}

	// Link previews: each page's og:image must be a file this site serves, in a
	// format social sites render (they ignore SVG).
	const missingImages = new Set<string>();
	const vectorImages = new Set<string>();
	for (const file of files.filter((file) => file.endsWith(".html"))) {
		const html = readFileSync(file, "utf8");
		const image = html.match(
			/<meta property="og:image" content="([^"]+)"/,
		)?.[1];
		if (!image) continue;
		const canonical = canonicalOf(html);
		let url: URL;
		try {
			url = new URL(image, canonical ?? "https://bookkit.invalid/");
		} catch {
			continue;
		}
		if (canonical && url.host !== hostOf(canonical)) continue;
		if (/\.svg$/i.test(url.pathname)) vectorImages.add(url.pathname);
		else if (!existsSync(join(distDir, decodeURIComponent(url.pathname)))) {
			missingImages.add(url.pathname);
		}
	}
	if (missingImages.size > 0) {
		const list = [...missingImages];
		error(
			`${list.length} page(s) name a link-preview image the build did not write: ${list.slice(0, 5).join(", ")}${list.length > 5 ? ", …" : ""}. Add bookkit() to integrations in astro.config.mjs (it renders them after the build), or put the file in public/.`,
		);
	}
	if (vectorImages.size > 0) {
		warning(
			`Link previews use SVG (${[...vectorImages].slice(0, 3).join(", ")}), which social sites do not render. Drop the page's ogImage to use the generated PNG.`,
		);
	}

	// Author tools are reachable but must stay out of search.
	for (const path of AUTHOR_ONLY_PATHS) {
		const page = pageFileFor(distDir, path);
		if (!page) continue;
		if (
			!/<meta name="robots" content="[^"]*noindex/.test(
				readFileSync(page, "utf8"),
			)
		) {
			error(
				`Author-only page ${path} is indexable. Pass robots="noindex, nofollow" to its layout.`,
				relative(distDir, page),
			);
		}
	}

	// A page's content holds only the HTML content may (html-allowlist.ts),
	// whatever step wrote it.
	for (const file of files) {
		const rel = relative(distDir, file).split("\\").join("/");
		if (!showsContent(rel)) continue;
		findings.push(...pageContentFindings(rel, readFileSync(file, "utf8")));
	}

	return {
		book,
		distDir,
		ok: !findings.some((finding) => finding.level === "error"),
		pageCount,
		findings,
	};
};

export const formatInspection = (result: BuildInspection): string[] => {
	const errors = result.findings.filter((f) => f.level === "error");
	const warnings = result.findings.filter((f) => f.level === "warning");
	const lines = [
		`BUILD OUTPUT ${result.book}: ${result.ok ? "ok" : "failed"} (${result.pageCount} page(s), ${errors.length} error(s), ${warnings.length} warning(s))`,
	];
	for (const finding of result.findings) {
		const where = finding.file ? `${finding.file}: ` : "";
		lines.push(`- [${finding.level}] ${where}${finding.message}`);
	}
	return lines;
};
