import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { inspectBuildOutput, LOCKOUT_MARKER } from "./build-output";

const HEALTHY_INDEX = `<!doctype html><html><head><title>On-Call Runbook</title><link rel="canonical" href="https://on-call.book/"></head><body>ok</body></html>`;

const write = (dist: string, rel: string, content: string | Uint8Array) => {
	const path = join(dist, rel);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content);
};

const writeHealthyDist = (dist: string) => {
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

describe("inspectBuildOutput", () => {
	let dist: string;

	beforeEach(() => {
		dist = mkdtempSync(join(tmpdir(), "bookkit-dist-"));
		writeHealthyDist(dist);
	});

	afterEach(() => {
		rmSync(dist, { recursive: true, force: true });
	});

	it("accepts a healthy static build", () => {
		const result = inspectBuildOutput({ book: "on-call", distDir: dist });

		expect(result.ok).toBe(true);
		expect(result.findings).toEqual([]);
		expect(result.pageCount).toBe(2);
	});

	it("fails when nothing has been built", () => {
		const result = inspectBuildOutput({
			book: "on-call",
			distDir: join(dist, "missing"),
		});

		expect(result.ok).toBe(false);
		expect(result.findings[0]?.message).toContain(
			"bun run bookkit build on-call",
		);
	});

	it("flags pages rendered as preview lockouts", () => {
		write(dist, "index.html", `<title>On-Call Runbook ${LOCKOUT_MARKER}`);
		write(dist, "exports/book.pdf", `<title>On-Call Runbook ${LOCKOUT_MARKER}`);

		const result = inspectBuildOutput({ book: "on-call", distDir: dist });
		const lockouts = result.findings.filter((f) =>
			f.message.includes("preview lockout"),
		);

		expect(result.ok).toBe(false);
		expect(lockouts.map((f) => f.file).sort()).toEqual([
			"exports/book.pdf",
			"index.html",
		]);
	});

	it("flags exports that are not real PDF or EPUB files", () => {
		write(dist, "exports/book.pdf", "<!doctype html><title>404</title>");
		write(dist, "exports/book.epub", "<!doctype html><title>404</title>");

		const result = inspectBuildOutput({ book: "on-call", distDir: dist });

		expect(result.ok).toBe(false);
		expect(result.findings.map((f) => f.file)).toEqual([
			"exports/book.pdf",
			"exports/book.epub",
		]);
	});

	it("reports missing required artifacts", () => {
		rmSync(join(dist, "404.html"));
		rmSync(join(dist, "sitemap.xml"));

		const result = inspectBuildOutput({ book: "on-call", distDir: dist });

		expect(result.ok).toBe(false);
		expect(result.findings.map((f) => f.file)).toEqual([
			"404.html",
			"sitemap.xml",
		]);
	});

	it("flags a site URL that differs between canonical, robots, and sitemap", () => {
		write(
			dist,
			"sitemap.xml",
			"<urlset><url><loc>https://bad-people.book/</loc></url></urlset>",
		);

		const result = inspectBuildOutput({ book: "crumple-zone", distDir: dist });

		expect(result.ok).toBe(false);
		expect(result.findings[0]?.message).toContain("Site URL disagrees");
		expect(result.findings[0]?.message).toContain("bad-people.book");
	});

	it("treats noindex as a warning for drafts and an error for published books", () => {
		write(
			dist,
			"index.html",
			HEALTHY_INDEX.replace(
				"</head>",
				'<meta name="robots" content="noindex, nofollow"></head>',
			),
		);

		const draft = inspectBuildOutput({ book: "on-call", distDir: dist });
		expect(draft.ok).toBe(true);
		expect(draft.findings[0]?.level).toBe("warning");

		const published = inspectBuildOutput({
			book: "on-call",
			distDir: dist,
			published: true,
		});
		expect(published.ok).toBe(false);
		expect(published.findings[0]?.message).toContain('"published"');
	});
});
