import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { AUTHOR_ONLY_PATHS } from "../../packages/astro-bookkit/src/seo/book";

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
	/** Published books must be indexable; drafts are expected to be noindex. */
	published?: boolean;
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
	"exports/book.pdf",
	"exports/book.epub",
] as const;

const MAGIC_BYTES: ReadonlyArray<readonly [string, string, string]> = [
	["exports/book.pdf", "%PDF", "a PDF"],
	["exports/book.epub", "PK", "an EPUB (zip)"],
];

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

export const inspectBuildOutput = ({
	book,
	distDir,
	published = false,
}: InspectBuildOptions): BuildInspection => {
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

	for (const rel of REQUIRED_FILES) {
		if (!existsSync(join(distDir, rel))) {
			error("Expected file is missing from the build output.", rel);
		}
	}

	const files = walk(distDir);
	const pageCount = files.filter((file) => file.endsWith(".html")).length;

	for (const file of files) {
		if (!SCANNED_EXTENSIONS.has(extname(file))) continue;
		if (readHead(file, SCAN_BYTES).includes(LOCKOUT_MARKER)) {
			error(
				"Rendered as a preview lockout page, so every visitor would be locked out. Disable previewAccess in book.config.ts or fix its tokens.",
				relative(distDir, file),
			);
		}
	}

	for (const [rel, magic, label] of MAGIC_BYTES) {
		const path = join(distDir, rel);
		if (!existsSync(path)) continue;
		if (!readHead(path, magic.length).startsWith(magic)) {
			error(
				`Does not start with ${JSON.stringify(magic)}, so it is not ${label}. The export route rendered something else (usually an HTML error page).`,
				rel,
			);
		}
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

		if (/<meta name="robots" content="[^"]*noindex/.test(html)) {
			if (published) {
				error(
					'Is marked noindex although the book status is "published". Build with NODE_ENV=production and without BOOKKIT_NOINDEX, or set site.indexable explicitly.',
					"index.html",
				);
			} else {
				warning(
					"Is marked noindex; search engines will skip this build. Expected while the book is a draft.",
					"index.html",
				);
			}
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
