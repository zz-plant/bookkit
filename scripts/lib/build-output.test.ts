import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import JSZip from "jszip";
import { inspectBuildOutput, LOCKOUT_MARKER } from "./build-output";
import {
	HEALTHY_INDEX,
	healthyExports,
	write,
	writeHealthyDist,
} from "./build-output.fixture";

describe("inspectBuildOutput", () => {
	let dist: string;

	beforeEach(async () => {
		dist = mkdtempSync(join(tmpdir(), "bookkit-dist-"));
		await writeHealthyDist(dist);
	});

	afterEach(() => {
		rmSync(dist, { recursive: true, force: true });
	});

	it("accepts a healthy static build", async () => {
		const result = await inspectBuildOutput({ book: "on-call", distDir: dist });

		expect(result.ok).toBe(true);
		expect(result.findings).toEqual([]);
		expect(result.pageCount).toBe(2);
	});

	it("fails when nothing has been built", async () => {
		const result = await inspectBuildOutput({
			book: "on-call",
			distDir: join(dist, "missing"),
		});

		expect(result.ok).toBe(false);
		expect(result.findings[0]?.message).toContain(
			"bun run bookkit build on-call",
		);
	});

	it("flags pages rendered as preview lockouts", async () => {
		write(dist, "index.html", `<title>On-Call Runbook ${LOCKOUT_MARKER}`);
		write(dist, "exports/book.pdf", `<title>On-Call Runbook ${LOCKOUT_MARKER}`);

		const result = await inspectBuildOutput({ book: "on-call", distDir: dist });
		const lockouts = result.findings.filter((f) =>
			f.message.includes("preview lockout"),
		);

		expect(result.ok).toBe(false);
		expect(lockouts.map((f) => f.file).sort()).toEqual([
			"exports/book.pdf",
			"index.html",
		]);
	});

	it("flags exports that are not real PDF or EPUB files", async () => {
		write(dist, "exports/book.pdf", "<!doctype html><title>404</title>");
		write(dist, "exports/book.epub", "<!doctype html><title>404</title>");

		const result = await inspectBuildOutput({ book: "on-call", distDir: dist });

		expect(result.ok).toBe(false);
		expect(result.findings.map((f) => f.file)).toEqual([
			"exports/book.epub",
			"exports/book.pdf",
		]);
		for (const finding of result.findings) {
			expect(finding.message).toContain("It holds an HTML page");
		}
	});

	it("opens every PDF and EPUB, naming the file and what is wrong with it", async () => {
		const [, epub] = await healthyExports();
		const zip = await JSZip.loadAsync(epub);
		zip.file(
			"OEBPS/text/chapter-overview.xhtml",
			'<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Unclosed</body></html>',
		);
		write(
			dist,
			"exports/chapters/overview.epub",
			await zip.generateAsync({ type: "uint8array" }),
		);
		// Starts like a PDF, so a check of the first bytes passed it.
		write(dist, "exports/chapters/overview.pdf", "%PDF-1.7\n%truncated");

		const result = await inspectBuildOutput({ book: "on-call", distDir: dist });

		expect(result.ok).toBe(false);
		expect(result.findings).toEqual([
			{
				level: "error",
				file: "exports/chapters/overview.epub",
				message: expect.stringContaining(
					"Is not a usable EPUB: OEBPS/text/chapter-overview.xhtml line 1: </body> closes <p>.",
				),
			},
			{
				level: "error",
				file: "exports/chapters/overview.pdf",
				message: expect.stringContaining(
					"Is not a usable PDF: not a readable PDF",
				),
			},
		]);
		expect(result.findings[1].message).toContain(
			"bun run bookkit build on-call",
		);
	});

	it("expects no book.pdf when the book turns the PDF off", async () => {
		rmSync(join(dist, "exports", "book.pdf"));

		const missing = await inspectBuildOutput({
			book: "on-call",
			distDir: dist,
		});
		expect(missing.findings).toEqual([
			{
				level: "error",
				file: "exports/book.pdf",
				message: expect.stringContaining("set exports: { pdf: false }"),
			},
		]);
		expect(
			(await inspectBuildOutput({ book: "on-call", distDir: dist, pdf: false }))
				.findings,
		).toEqual([]);
	});

	it("flags .json files that hold a page or do not parse", async () => {
		write(dist, "api/feedback.json", "<!DOCTYPE html><title>Not found</title>");
		write(dist, "api/broken.json", '{"ok": tru');
		write(dist, "api/mcp.json", '{"ok":true}');

		const result = await inspectBuildOutput({ book: "on-call", distDir: dist });

		expect(result.ok).toBe(false);
		expect(
			result.findings.map((f) => [f.file, f.message.split(".")[0]]).sort(),
		).toEqual([
			["api/broken.json", "Is not valid JSON"],
			["api/feedback.json", "Holds an HTML page, not JSON"],
		]);
	});

	it("reports missing required artifacts", async () => {
		rmSync(join(dist, "404.html"));
		rmSync(join(dist, "sitemap.xml"));

		const result = await inspectBuildOutput({ book: "on-call", distDir: dist });

		expect(result.ok).toBe(false);
		expect(result.findings.map((f) => f.file)).toEqual([
			"404.html",
			"sitemap.xml",
		]);
	});

	it("flags a site URL that differs between canonical, robots, and sitemap", async () => {
		write(
			dist,
			"sitemap.xml",
			"<urlset><url><loc>https://bad-people.book/</loc></url></urlset>",
		);

		const result = await inspectBuildOutput({
			book: "crumple-zone",
			distDir: dist,
		});

		expect(result.ok).toBe(false);
		expect(result.findings[0]?.message).toContain("Site URL disagrees");
		expect(result.findings[0]?.message).toContain("bad-people.book");
	});

	it("requires noindex on an unreleased book and indexing on a released one", async () => {
		// writeHealthyDist builds a draft by default: noindex.
		expect(
			(
				await inspectBuildOutput({
					book: "on-call",
					distDir: dist,
					published: false,
				})
			).findings,
		).toEqual([]);
		const noindexed = await inspectBuildOutput({
			book: "on-call",
			distDir: dist,
			published: true,
		});
		expect(noindexed.ok).toBe(false);
		expect(noindexed.findings[0]?.message).toContain("published or stable");

		await writeHealthyDist(dist, { published: true });
		expect(
			(
				await inspectBuildOutput({
					book: "on-call",
					distDir: dist,
					published: true,
				})
			).findings,
		).toEqual([]);
		const indexable = await inspectBuildOutput({
			book: "on-call",
			distDir: dist,
			published: false,
		});
		expect(indexable.ok).toBe(false);
		expect(indexable.findings[0]?.message).toContain("not published or stable");
	});

	it("refuses preview access on a static build, since nothing enforces it", async () => {
		const result = await inspectBuildOutput({
			book: "bad-people",
			distDir: dist,
			previewAccessOnStaticSite: true,
		});
		expect(result.ok).toBe(false);
		expect(result.findings[0]?.message).toContain("every page here is public");
	});

	it("requires a chapter page once the book is past draft", async () => {
		const empty = await inspectBuildOutput({
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
			(
				await inspectBuildOutput({
					book: "on-call",
					distDir: dist,
					requireChapters: true,
				})
			).ok,
		).toBe(true);
	});

	it("flags client code shipped as raw TypeScript", async () => {
		write(dist, "_astro/ui.BWQLcm1E.ts", "type AnalyticsEvent = {};");
		write(
			dist,
			"read/index.html",
			'<html><head><link rel="canonical" href="https://on-call.book/read"></head><body><script type="module" src="/_astro/ui.BWQLcm1E.ts"></script></body></html>',
		);
		const result = await inspectBuildOutput({ book: "on-call", distDir: dist });
		expect(result.ok).toBe(false);
		expect(result.findings.map((f) => f.file)).toEqual(
			expect.arrayContaining(["_astro/ui.BWQLcm1E.ts", "read/index.html"]),
		);
	});

	it("flags sitemap URLs with no built page", async () => {
		write(
			dist,
			"sitemap.xml",
			"<urlset><url><loc>https://on-call.book/</loc></url><url><loc>https://on-call.book/read/examples/a/b</loc></url></urlset>",
		);
		const result = await inspectBuildOutput({ book: "on-call", distDir: dist });
		expect(result.ok).toBe(false);
		expect(result.findings[0]?.message).toContain("/read/examples/a/b");
	});

	it("flags a canonical that differs from its sitemap URL", async () => {
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
		const result = await inspectBuildOutput({ book: "on-call", distDir: dist });
		expect(result.ok).toBe(false);
		expect(result.findings[0]?.file).toBe("read/chapters/drills/index.html");
	});

	it("requires author-only pages to be noindex", async () => {
		write(dist, "new-book/index.html", "<html><head></head></html>");
		expect(
			(await inspectBuildOutput({ book: "on-call", distDir: dist })).ok,
		).toBe(false);
		write(
			dist,
			"new-book/index.html",
			'<html><head><meta name="robots" content="noindex, nofollow"></head></html>',
		);
		expect(
			(await inspectBuildOutput({ book: "on-call", distDir: dist })).ok,
		).toBe(true);
	});

	it("flags search results that lead to a missing page or heading", async () => {
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
		const result = await inspectBuildOutput({ book: "on-call", distDir: dist });
		expect(result.ok).toBe(false);
		const message = result.findings[0]?.message ?? "";
		expect(message).toContain("2 search result link(s)");
		expect(message).toContain("/read/examples/a/b#start (no page)");
		expect(message).toContain("/#missing-heading (no heading with that id)");
	});

	it("flags link-preview images the build did not write, and SVG previews", async () => {
		const withImage = (image: string) =>
			HEALTHY_INDEX.replace(
				"</head>",
				`<meta property="og:image" content="${image}"></head>`,
			);
		write(dist, "index.html", withImage("https://on-call.book/og/index.png"));
		let result = await inspectBuildOutput({ book: "on-call", distDir: dist });
		expect(result.ok).toBe(false);
		expect(result.findings[0]?.message).toContain("/og/index.png");

		write(dist, "og/index.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
		expect(
			(await inspectBuildOutput({ book: "on-call", distDir: dist })).ok,
		).toBe(true);

		write(dist, "index.html", withImage("/og/default.svg"));
		result = await inspectBuildOutput({ book: "on-call", distDir: dist });
		expect(result.ok).toBe(true);
		expect(result.findings[0]?.level).toBe("warning");
		expect(result.findings[0]?.message).toContain("SVG");
	});
});

describe("a page's content", () => {
	let dist: string;

	beforeEach(async () => {
		dist = mkdtempSync(join(tmpdir(), "bookkit-dist-"));
		await writeHealthyDist(dist);
	});

	afterEach(() => {
		rmSync(dist, { recursive: true, force: true });
	});

	const CHAPTER =
		'<section class="content-block chapter-content" data-chapter-sections>';
	const SECTION = '<section class="content-block">';

	/** A built page: content in its content section, inside the engine's chrome, which holds what content may not. */
	const page = (content: string, section = CHAPTER) =>
		`<!doctype html><html><head><title>Drills</title><script type="module" src="/_astro/ui.js"></script></head><body data-analytics-key="on-call"><header><button data-search-toggle style="color:red">Search</button><svg viewBox="0 0 1 1"><path d="M0 0"/></svg></header><main><article>${section}${content}</section></article><form data-qa-form><textarea></textarea></form></main><script>window.x = 1;</script></body></html>`;

	/** What the site's own Markdown writes (Astro's defaults) that raw HTML may not. */
	const MARKDOWN = [
		'<pre class="astro-code github-dark" style="background-color:#24292e;color:#e1e4e8;overflow-x:auto" tabindex="0" data-language="ts"><code><span class="line"><span style="color:#F97583">const</span><span style="color:#79B8FF"> x</span></span></code></pre>',
		'<p>A note.<sup><a href="#user-content-fn-1" id="user-content-fnref-1" data-footnote-ref="true" aria-describedby="footnote-label">1</a></sup></p>',
		'<ul class="contains-task-list"><li class="task-list-item"><input type="checkbox" checked disabled/> done</li></ul>',
		'<table><thead><tr><th style="text-align:left">a</th></tr></thead><tbody><tr><td style="text-align:right">1</td></tr></tbody></table>',
		'<iframe width="560" height="315" src="https://www.youtube.com/embed/x" title="YouTube video player" frameborder="0" allowfullscreen></iframe>',
		'<section data-footnotes="true" class="footnotes"><h2 class="sr-only" id="footnote-label">Footnotes</h2><ol><li id="user-content-fn-1"><p>The note. <a href="#user-content-fnref-1" data-footnote-backref aria-label="Back to reference 1" class="data-footnote-backref">↩</a></p></li></ol></section>',
	].join("\n");

	it("passes what the site's Markdown writes, and leaves the engine's chrome around it alone", async () => {
		write(dist, "read/chapters/drills/index.html", page(MARKDOWN));
		write(dist, "read/toolkit/ramp/index.html", page("<p>Words</p>", SECTION));
		write(dist, "es/read/glossary/sev/index.html", page("<p>P</p>", SECTION));
		write(dist, "release-notes/index.html", page("<p>Notes</p>", SECTION));
		// Lists, the hub, and the home page show no content of their own.
		write(dist, "read/chapters/index.html", page("<button>x</button>"));
		write(dist, "read/index.html", page("<button>x</button>", SECTION));

		const result = await inspectBuildOutput({ book: "on-call", distDir: dist });
		expect(result.findings).toEqual([]);
	});

	it("fails a page whose content holds HTML content may not, naming each part and why", async () => {
		write(
			dist,
			"read/chapters/drills/index.html",
			page(
				[
					MARKDOWN,
					'<p onclick="alert(1)">a</p>',
					"<script>alert(2)</script>",
					'<img src="x" onerror="alert(3)">',
					'<span style="position:fixed;inset:0">cover</span>',
					'<a href="java&#x09;script:alert(4)">link</a>',
					'<section data-footnotes><p data-resume-reading="">p</p></section>',
				].join(""),
			),
		);

		const result = await inspectBuildOutput({ book: "on-call", distDir: dist });
		expect(result.ok).toBe(false);
		expect(result.findings).toEqual([
			{
				level: "error",
				file: "read/chapters/drills/index.html",
				message: [
					"Its content holds HTML a book's content may not: ",
					'<p onclick="alert(1)">, since an event handler runs script, and a book\'s content runs none; ',
					"<script>, since a book's content runs no script; ",
					'<img onerror="alert(3)">, since an event handler runs script, and a book\'s content runs none; ',
					'<span style="position:fixed;inset:0">, since inline style can restyle or cover the page, which takes its styling from the book\'s stylesheet; ',
					'<a href="java\tscript:alert(4)">, since a book links only to http, https, mailto, tel, and ftp addresses and to its own pages; ',
					"and 1 more. ",
					"The site's Markdown step leaves such HTML out of every page it builds, so something added it after that step: a Markdown, MDX, or rehype plugin in astro.config.mjs, or a Bookkit bug to report with this message.",
				].join(""),
			},
		]);
	});

	it("reads every content section of a page, and each locale's and release's", async () => {
		write(
			dist,
			"read/toolkit/ramp/index.html",
			page(
				`<p>Steps</p></section>${SECTION}<p><button>Go</button></p>`,
				SECTION,
			),
		);
		write(
			dist,
			"fr/read/examples/a/b/index.html",
			page('<video src="talk.mp4"></video>', SECTION),
		);
		write(
			dist,
			"release-notes/index.html",
			page(`<p>v1</p></section>${SECTION}<style>body{}</style>`, SECTION),
		);

		const result = await inspectBuildOutput({ book: "on-call", distDir: dist });
		expect(
			result.findings
				.map(({ file, message }) => [file, message.split(". The site")[0]])
				.sort(),
		).toEqual([
			[
				"fr/read/examples/a/b/index.html",
				"Its content holds HTML a book's content may not: <video>, since <video> is not an element a book's content keeps",
			],
			[
				"read/toolkit/ramp/index.html",
				"Its content holds HTML a book's content may not: <button>, since a book's content collects nothing a reader types",
			],
			[
				"release-notes/index.html",
				"Its content holds HTML a book's content may not: <style>, since a book's pages take their styling from its stylesheet",
			],
		]);
	});

	it("warns when a page that shows content has no content section to read", async () => {
		write(
			dist,
			"read/mechanisms/triage/index.html",
			"<html><body><main><p>Words</p></main></body></html>",
		);
		// Release notes with no notes of their own have none.
		write(dist, "release-notes/index.html", "<html><body></body></html>");

		const result = await inspectBuildOutput({ book: "on-call", distDir: dist });
		expect(result.ok).toBe(true);
		expect(result.findings).toEqual([
			{
				level: "warning",
				file: "read/mechanisms/triage/index.html",
				message:
					"Shows the book's content, but holds no <section class=\"content-block\"> around it, so check:build could not check that content's HTML. The engine's page templates (packages/astro-bookkit/templates/book-app/src/pages/read) wrap <Content /> in one; restore it in this page's template.",
			},
		]);
	});
});
