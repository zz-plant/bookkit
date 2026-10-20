import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
	createEpubExport,
	createPdfExport,
	type ExportBundle,
} from "../../packages/astro-bookkit/src/exports";
import { LOCKOUT_MARKER } from "./build-output";

/** A `dist/` that passes `inspectBuildOutput`, for tests to start from and break. */

export const HEALTHY_INDEX = `<!doctype html><html><head><title>On-Call Runbook</title><link rel="canonical" href="https://on-call.book/"></head><body>ok</body></html>`;

/** What a build adds to every page of a book that is not published or stable. */
export const NOINDEX_META = '<meta name="robots" content="noindex, nofollow">';

export const write = (
	dist: string,
	rel: string,
	content: string | Uint8Array,
) => {
	const path = join(dist, rel);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content);
};

const BUNDLE: ExportBundle = {
	title: "On-Call Runbook",
	updatedAt: "2026-02-10",
	parts: [
		{
			title: "Chapters",
			entries: [
				{
					kind: "chapter",
					slug: "overview",
					title: "Overview",
					body: "Every alert needs one named owner.",
				},
			],
		},
	],
};

let built: Promise<[Uint8Array, Uint8Array]> | undefined;
/** A real PDF and EPUB, made once: check:build opens them. */
export const healthyExports = () => {
	built ??= Promise.all([createPdfExport(BUNDLE), createEpubExport(BUNDLE)]);
	return built;
};

/**
 * `published`: the build of a published or stable book, whose pages are
 * indexable. Otherwise (the default, like a new book) it is a draft's build,
 * which is noindex. `pdf: false`: a book that turns its PDF off.
 */
export const writeHealthyDist = async (
	dist: string,
	{
		published = false,
		pdf = true,
	}: { published?: boolean; pdf?: boolean } = {},
) => {
	write(
		dist,
		"index.html",
		published
			? HEALTHY_INDEX
			: HEALTHY_INDEX.replace("</head>", `${NOINDEX_META}</head>`),
	);
	write(dist, "404.html", "<title>Page not found</title>");
	write(
		dist,
		"robots.txt",
		"User-agent: *\nAllow: /\nHost: on-call.book\nSitemap: https://on-call.book/sitemap.xml\n",
	);
	write(
		dist,
		"sitemap.xml",
		'<?xml version="1.0"?><urlset><url><loc>https://on-call.book/</loc></url></urlset>',
	);
	write(dist, "search-index.json", "[]");
	write(dist, "release-notes.xml", "<rss/>");
	const [pdfBytes, epubBytes] = await healthyExports();
	if (pdf) write(dist, "exports/book.pdf", pdfBytes);
	write(dist, "exports/book.epub", epubBytes);
	write(
		dist,
		"_astro/app.js",
		`// "${LOCKOUT_MARKER}" inside a bundle is not a page`,
	);
};
