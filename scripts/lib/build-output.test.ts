import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { inspectBuildOutput, LOCKOUT_MARKER } from "./build-output";
import { HEALTHY_INDEX, write, writeHealthyDist } from "./build-output.fixture";

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

	it("flags .json files that hold a page or do not parse", () => {
		write(dist, "api/feedback.json", "<!DOCTYPE html><title>Not found</title>");
		write(dist, "api/broken.json", '{"ok": tru');
		write(dist, "api/mcp.json", '{"ok":true}');

		const result = inspectBuildOutput({ book: "on-call", distDir: dist });

		expect(result.ok).toBe(false);
		expect(
			result.findings.map((f) => [f.file, f.message.split(".")[0]]).sort(),
		).toEqual([
			["api/broken.json", "Is not valid JSON"],
			["api/feedback.json", "Holds an HTML page, not JSON"],
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

	it("requires noindex on an unreleased book and indexing on a released one", () => {
		// writeHealthyDist builds a draft by default: noindex.
		expect(
			inspectBuildOutput({ book: "on-call", distDir: dist, published: false })
				.findings,
		).toEqual([]);
		const noindexed = inspectBuildOutput({
			book: "on-call",
			distDir: dist,
			published: true,
		});
		expect(noindexed.ok).toBe(false);
		expect(noindexed.findings[0]?.message).toContain("published or stable");

		writeHealthyDist(dist, { published: true });
		expect(
			inspectBuildOutput({ book: "on-call", distDir: dist, published: true })
				.findings,
		).toEqual([]);
		const indexable = inspectBuildOutput({
			book: "on-call",
			distDir: dist,
			published: false,
		});
		expect(indexable.ok).toBe(false);
		expect(indexable.findings[0]?.message).toContain("not published or stable");
	});

	it("refuses preview access on a static build, since nothing enforces it", () => {
		const result = inspectBuildOutput({
			book: "bad-people",
			distDir: dist,
			previewAccessOnStaticSite: true,
		});
		expect(result.ok).toBe(false);
		expect(result.findings[0]?.message).toContain("every page here is public");
	});

	it("requires a chapter page once the book is past draft", () => {
		const empty = inspectBuildOutput({
			book: "on-call",
			distDir: dist,
			requireChapters: true,
		});
		expect(empty.ok).toBe(false);
		expect(empty.findings[0]).toMatchObject({ file: "read/chapters/" });

		write(
			dist,
			"read/chapters/overview/index.html",
			'<html><head><link rel="canonical" href="https://on-call.book/read/chapters/overview"></head></html>',
		);
		expect(
			inspectBuildOutput({
				book: "on-call",
				distDir: dist,
				requireChapters: true,
			}).ok,
		).toBe(true);
	});

	it("flags client code shipped as raw TypeScript", () => {
		write(dist, "_astro/ui.BWQLcm1E.ts", "type AnalyticsEvent = {};");
		write(
			dist,
			"read/index.html",
			'<html><head><link rel="canonical" href="https://on-call.book/read"></head><body><script type="module" src="/_astro/ui.BWQLcm1E.ts"></script></body></html>',
		);
		const result = inspectBuildOutput({ book: "on-call", distDir: dist });
		expect(result.ok).toBe(false);
		expect(result.findings.map((f) => f.file)).toEqual(
			expect.arrayContaining(["_astro/ui.BWQLcm1E.ts", "read/index.html"]),
		);
	});

	it("flags sitemap URLs with no built page", () => {
		write(
			dist,
			"sitemap.xml",
			"<urlset><url><loc>https://on-call.book/</loc></url><url><loc>https://on-call.book/read/examples/a/b</loc></url></urlset>",
		);
		const result = inspectBuildOutput({ book: "on-call", distDir: dist });
		expect(result.ok).toBe(false);
		expect(result.findings[0]?.message).toContain("/read/examples/a/b");
	});

	it("flags a canonical that differs from its sitemap URL", () => {
		write(
			dist,
			"sitemap.xml",
			"<urlset><url><loc>https://on-call.book/</loc></url><url><loc>https://on-call.book/read/chapters/drills</loc></url></urlset>",
		);
		write(
			dist,
			"read/chapters/drills/index.html",
			'<html><head><link rel="canonical" href="https://on-call.book/read/chapters/drills/"></head></html>',
		);
		const result = inspectBuildOutput({ book: "on-call", distDir: dist });
		expect(result.ok).toBe(false);
		expect(result.findings[0]?.file).toBe("read/chapters/drills/index.html");
	});

	it("requires author-only pages to be noindex", () => {
		write(dist, "new-book/index.html", "<html><head></head></html>");
		expect(inspectBuildOutput({ book: "on-call", distDir: dist }).ok).toBe(
			false,
		);
		write(
			dist,
			"new-book/index.html",
			'<html><head><meta name="robots" content="noindex, nofollow"></head></html>',
		);
		expect(inspectBuildOutput({ book: "on-call", distDir: dist }).ok).toBe(
			true,
		);
	});

	it("flags search results that lead to a missing page or heading", () => {
		write(
			dist,
			"search-index.json",
			JSON.stringify({
				entries: [
					{ url: "/#intro" },
					{ url: "/read/examples/a/b#start" },
					{ url: "/#missing-heading" },
				],
			}),
		);
		write(
			dist,
			"index.html",
			HEALTHY_INDEX.replace("<body>", '<body><h2 id="intro">Intro</h2>'),
		);
		const result = inspectBuildOutput({ book: "on-call", distDir: dist });
		expect(result.ok).toBe(false);
		const message = result.findings[0]?.message ?? "";
		expect(message).toContain("2 search result link(s)");
		expect(message).toContain("/read/examples/a/b#start (no page)");
		expect(message).toContain("/#missing-heading (no heading with that id)");
	});

	it("flags link-preview images the build did not write, and SVG previews", () => {
		const withImage = (image: string) =>
			HEALTHY_INDEX.replace(
				"</head>",
				`<meta property="og:image" content="${image}"></head>`,
			);
		write(dist, "index.html", withImage("https://on-call.book/og/index.png"));
		let result = inspectBuildOutput({ book: "on-call", distDir: dist });
		expect(result.ok).toBe(false);
		expect(result.findings[0]?.message).toContain("/og/index.png");

		write(dist, "og/index.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
		expect(inspectBuildOutput({ book: "on-call", distDir: dist }).ok).toBe(
			true,
		);

		write(dist, "index.html", withImage("/og/default.svg"));
		result = inspectBuildOutput({ book: "on-call", distDir: dist });
		expect(result.ok).toBe(true);
		expect(result.findings[0]?.level).toBe("warning");
		expect(result.findings[0]?.message).toContain("SVG");
	});
});
