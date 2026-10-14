import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { LOCKOUT_MARKER } from "./build-output";

/** A `dist/` that passes `inspectBuildOutput`, for tests to start from and break. */

export const HEALTHY_INDEX = `<!doctype html><html><head><title>On-Call Runbook</title><link rel="canonical" href="https://on-call.book/"></head><body>ok</body></html>`;

export const write = (
	dist: string,
	rel: string,
	content: string | Uint8Array,
) => {
	const path = join(dist, rel);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content);
};

export const writeHealthyDist = (dist: string) => {
	write(dist, "index.html", HEALTHY_INDEX);
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
	write(dist, "exports/book.pdf", "%PDF-1.7\n%fake");
	write(dist, "exports/book.epub", new Uint8Array([0x50, 0x4b, 0x03, 0x04]));
	write(
		dist,
		"_astro/app.js",
		`// "${LOCKOUT_MARKER}" inside a bundle is not a page`,
	);
};
