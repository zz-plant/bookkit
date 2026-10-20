import { afterEach, describe, expect, it, setSystemTime } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import JSZip from "jszip";
import {
	type PDFArray,
	PDFDict,
	PDFDocument,
	type PDFHexString,
	PDFName,
	type PDFRef,
} from "pdf-lib";

import { extractPdfText, inspectEpub, inspectPdf } from "../exports";
import { createBookExportHelpersFromConfig } from "./exports";
import { createBookRuntime } from "./runtime";

/**
 * A small runbook book, built through createBookRuntime exactly as a book
 * app does, so these tests cover the wiring as well as the generators.
 */
const raw = {
	chapters: {
		"../content/book/chapters/00-overview.mdx": `---
slug: overview
title: Overview
---

## Ownership

Every alert needs one named owner.`,
		"../content/book/chapters/00-overview.fr.mdx": `---
slug: overview
title: Vue d'ensemble
locale: fr
---

## Responsabilité`,
		"../content/book/chapters/10-next.mdx": `---
slug: next-steps
title: Next steps
---

{/* Bind the mechanisms this chapter uses in \`mechanisms:\` above. */}

Read [the overview](/read/chapters/overview#ownership), then [triage](/read/mechanisms/triage).
Set \`max_retries\` and watch _error_rate_ & _latency_; see [downloads](/downloads).

1. Classify.
2. Escalate.

<Callout>Shown as text.</Callout>`,
	},
	mechanisms: {
		"../content/book/mechanisms/escalation.mdx": `---
slug: escalation
title: Escalation
definition: An escalation names a target, a trigger, and a window.
is: ["A named target."]
isNot: ["A louder thread."]
predictions: ["Unnamed escalations stall."]
tests: ["Name the target in one minute."]
---`,
		"../content/book/mechanisms/triage.mdx": `---
slug: triage
title: Triage
definition: An alert without a severity has no safe next action.
is: ["A severity within ten minutes."]
isNot: ["A full diagnosis."]
predictions: ["Unclassified alerts stall."]
tests: ["Classify three alerts in ten minutes."]
---

{/* Optional prose. */}`,
	},
	toolkit: {
		"../content/book/toolkit/escalation--ramp.mdx": `---
slug: ramp
mechanism: escalation
name: Ramp escalation
timeboxMinutes: 5
steps: ["Page the named target."]
---`,
		"../content/book/toolkit/triage--classify.mdx": `---
slug: classify
mechanism: triage
name: Classify the alert
owner: platform-oncall
reviewEveryDays: 30
trigger: A pager alert fires.
timeboxMinutes: 10
steps:
  - Read the payload.
  - Classify severity.
runbookSteps:
  - when: Money is at risk
    action: Classify as sev-1.
  - action: Note the alert in the incident log.
escalation:
  to: duty-manager
  when: A sev-1 is confirmed.
  withinHours: 1
drills:
  - Classify three sample alerts.
---

Stop after naming an owner.`,
	},
	glossary: {
		"../content/book/glossary/severity.mdx": `---
slug: severity
term: Severity
---

How much user impact an alert represents.`,
	},
	examples: {
		"../content/book/examples/triage/quiet-alert.mdx": `---
mechanism: triage
domain: payments
title: Quiet alert
---

A billing alert fires at 02:00 and is classified sev-2.`,
	},
};

const READING_ORDER = [
	"Chapters",
	"Overview",
	"Next steps",
	"Mechanisms and actions",
	"Triage",
	"Classify the alert",
	"Escalation",
	"Ramp escalation",
	"Glossary",
	"Severity",
	"Examples",
	"Quiet alert",
];

const createRuntime = (
	options: {
		releases?: boolean;
		exports?: { pdf?: boolean; pdfFont?: string };
	} = {},
) =>
	createBookRuntime({
		bookConfig: {
			slug: "drill-book",
			title: "Drill Book",
			status: "draft",
			author: { name: "Ada Example" },
			site: { url: "https://drill.example" },
			localization: { defaultLocale: "en-GB" },
			// The author's order, not the alphabet: triage comes first.
			mechanisms: [{ slug: "triage" }, { slug: "escalation" }],
			exports: options.exports,
		},
		modules: {
			contentModules: {
				chapters: {
					"../content/book/chapters/00-overview.mdx": {
						frontmatter: { slug: "overview", title: "Overview" },
					},
					"../content/book/chapters/10-next.mdx": {
						frontmatter: { slug: "next-steps", title: "Next steps" },
					},
				},
				mechanisms: {},
				toolkit: {},
				glossary: {},
				examples: {},
			},
			contentRawModules: raw,
			releaseModules:
				options.releases === false
					? {}
					: {
							"../content/book/releases/2024-08-22.mdx": {
								frontmatter: { version: "0.1.0", date: "2024-08-22" },
							},
							"../content/book/releases/2024-09-15.mdx": {
								frontmatter: { version: "0.2.0", date: "2024-09-15" },
							},
						},
		},
	} as Parameters<typeof createBookRuntime>[0]);

type Runtime = ReturnType<typeof createRuntime>;

const download = async (response: Response) =>
	new Uint8Array(await response.arrayBuffer());
const bookEpub = async (runtime: Runtime) =>
	download(await runtime.exportRoutes.book.epub.GET());
const bookPdf = async (runtime: Runtime) =>
	download(await runtime.exportRoutes.book.pdf.GET());

const decodeEntities = (text: string) =>
	text
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, "&");

const readEpub = async (bytes: Uint8Array) => {
	const zip = await JSZip.loadAsync(bytes);
	const read = async (path: string) =>
		(await zip.file(path)?.async("string")) ?? "";
	const opf = await read("OEBPS/content.opf");
	const hrefs = new Map(
		[...opf.matchAll(/<item id="([^"]+)" href="([^"]+)"/g)].map(
			([, id, href]) => [id, href],
		),
	);
	const spine = [...opf.matchAll(/<itemref idref="([^"]+)"/g)].map(
		([, idref]) => `OEBPS/${hrefs.get(idref)}`,
	);
	const headings = await Promise.all(
		spine.map(async (path) =>
			decodeEntities(
				(await read(path)).match(/<h1[^>]*>([^<]*)<\/h1>/)?.[1] ?? "",
			),
		),
	);
	const meta = (pattern: RegExp) => opf.match(pattern)?.[1];
	return {
		read,
		paths: Object.keys(zip.files),
		headings,
		identifier: meta(/<dc:identifier id="book-id">([^<]+)</),
		modified: meta(/<meta property="dcterms:modified">([^<]+)</),
		date: meta(/<dc:date>([^<]+)</),
		creator: meta(/<dc:creator[^>]*>([^<]+)</),
		language: meta(/<dc:language>([^<]+)</),
	};
};

/** Outline (bookmark) titles, depth-first, with the page each one opens. */
const readOutline = async (bytes: Uint8Array) => {
	const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
	const pageOf = new Map(
		pdf.getPages().map((page, index) => [page.ref.toString(), index]),
	);
	const items: Array<{ title: string; depth: number; page?: number }> = [];
	const walk = (first: PDFRef | undefined, depth: number) => {
		for (let ref = first; ref; ) {
			const item = pdf.context.lookup(ref, PDFDict);
			const destination = item.get(PDFName.of("Dest")) as PDFArray;
			items.push({
				title: (item.get(PDFName.of("Title")) as PDFHexString).decodeText(),
				depth,
				page: pageOf.get(destination.get(0).toString()),
			});
			walk(item.get(PDFName.of("First")) as PDFRef | undefined, depth + 1);
			ref = item.get(PDFName.of("Next")) as PDFRef | undefined;
		}
	};
	const outlines = pdf.catalog.lookup(PDFName.of("Outlines"), PDFDict);
	walk(outlines.get(PDFName.of("First")) as PDFRef, 0);
	return {
		items,
		pageMode: pdf.catalog.get(PDFName.of("PageMode"))?.toString(),
		info: {
			title: pdf.getTitle(),
			author: pdf.getAuthor(),
			created: pdf.getCreationDate()?.toISOString(),
		},
	};
};

type Helpers = ReturnType<typeof createBookExportHelpersFromConfig>;
const createExport = async (helpers: Helpers, format: "pdf" | "epub") => {
	const { createExportResponse } = await import("../exports");
	return download(
		await createExportResponse(
			helpers.getBookExportBundle(),
			format,
			`book.${format}`,
			helpers.render,
		),
	);
};
const createPdfFromHelpers = (helpers: Helpers) => createExport(helpers, "pdf");
const createEpubFromHelpers = (helpers: Helpers) =>
	createExport(helpers, "epub");

const pageText = async (bytes: Uint8Array) =>
	(await extractPdfText(bytes)).map((runs) =>
		runs.map((run) => run.text).join("\n"),
	);

afterEach(() => {
	setSystemTime();
	delete process.env.SOURCE_DATE_EPOCH;
});

describe("book exports", () => {
	it("hold every record type, each mechanism followed by its actions", async () => {
		const runtime = createRuntime();
		const epub = await readEpub(await bookEpub(runtime));
		expect(epub.headings).toEqual(["Drill Book", "Contents", ...READING_ORDER]);

		const outline = await readOutline(await bookPdf(runtime));
		expect(outline.items.map((item) => item.title)).toEqual(READING_ORDER);
		expect(
			outline.items.find((item) => item.title === "Classify the alert")?.depth,
		).toBe(2);
	});

	it("write out a toolkit action's procedure, not only its body", async () => {
		const runtime = createRuntime();
		const epub = await readEpub(await bookEpub(runtime));
		const action = await epub.read("OEBPS/text/tool-classify.xhtml");
		for (const expected of [
			"10 minutes · Owner: platform-oncall · Review every 30 days",
			"<p>A pager alert fires.</p>",
			"<ol><li>Read the payload.</li><li>Classify severity.</li></ol>",
			"<strong>Money is at risk:</strong> Classify as sev-1.",
			// As the toolkit page labels a step without a condition.
			"<strong>In any situation:</strong> Note the alert in the incident log.",
			"<strong>To:</strong> duty-manager",
			"<strong>Within:</strong> 1 hour",
			"Classify three sample alerts.",
			"Stop after naming an owner.",
		]) {
			expect(action).toContain(expected);
		}

		const pdf = await bookPdf(runtime);
		const outline = await readOutline(pdf);
		const page = outline.items.find(
			(item) => item.title === "Classify the alert",
		)?.page as number;
		expect((await pageText(pdf))[page]).toContain("Classify as sev-1.");
	});

	it("leave out translations and author notes", async () => {
		const runtime = createRuntime();
		const epub = await readEpub(await bookEpub(runtime));
		const text = (
			await Promise.all(epub.paths.map((path) => epub.read(path)))
		).join("\n");
		expect(text).not.toContain("Vue d'ensemble");
		expect(text).not.toContain("{/*");
		expect(text).not.toContain("Bind the mechanisms");
		expect((await pageText(await bookPdf(runtime))).join("\n")).not.toContain(
			"Bind the mechanisms",
		);
	});

	it("carry a stable identifier, the author, the language, and the release date", async () => {
		setSystemTime(new Date("2026-01-01T08:00:00.123Z"));
		const first = await readEpub(await bookEpub(createRuntime()));
		setSystemTime(new Date("2026-06-30T17:41:10.775Z"));
		const second = await readEpub(await bookEpub(createRuntime()));

		expect(first.identifier).toBe(
			"urn:uuid:df5334f8-44d7-597e-8b63-9b1254a49d35",
		);
		expect(second.identifier).toBe(first.identifier);
		expect(first.modified).toBe("2024-09-15T00:00:00Z");
		expect(first.date).toBe("2024-09-15");
		expect(first.creator).toBe("Ada Example");
		expect(first.language).toBe("en-GB");

		const outline = await readOutline(await bookPdf(createRuntime()));
		expect(outline.info).toEqual({
			title: "Drill Book",
			author: "Ada Example",
			created: "2024-09-15T00:00:00.000Z",
		});
		expect(outline.pageMode).toBe("/UseOutlines");
	});

	it("open with the title, author, version, and release date, never the build time", async () => {
		setSystemTime(new Date("2026-10-14T17:41:10.775Z"));
		const runtime = createRuntime();
		const edition = "Draft · Version 0.2.0 · September 15, 2024";

		const titlePage = await (await readEpub(await bookEpub(runtime))).read(
			"OEBPS/title.xhtml",
		);
		expect(titlePage).toContain("<h1>Drill Book</h1>");
		expect(titlePage).toContain("Ada Example");
		expect(titlePage).toContain(edition);

		const [first] = await pageText(await bookPdf(runtime));
		expect(first).toBe(["Drill Book", "Ada Example", edition].join("\n"));
		for (const text of [titlePage, first]) {
			expect(text).not.toContain("Exported");
			expect(text).not.toContain("2026");
		}
	});

	it("are byte-identical when unchanged content is rebuilt later", async () => {
		const build = async () => {
			const runtime = createRuntime();
			return Promise.all([
				bookEpub(runtime),
				bookPdf(runtime),
				download(
					await runtime.exportRoutes.chapters.epub.GET({
						params: { slug: "overview" },
					}),
				),
				download(
					await runtime.exportRoutes.chapters.pdf.GET({
						params: { slug: "overview" },
					}),
				),
			]);
		};
		setSystemTime(new Date("2026-01-01T00:00:00Z"));
		const first = await build();
		setSystemTime(new Date("2026-07-04T12:34:56Z"));
		const second = await build();
		for (const [index, bytes] of first.entries()) {
			expect(Buffer.compare(bytes, second[index])).toBe(0);
		}
	});

	it("link to other records inside the EPUB, and to the site for other pages", async () => {
		const runtime = createRuntime();
		const epub = await readEpub(await bookEpub(runtime));
		const chapter = await epub.read("OEBPS/text/chapter-next-steps.xhtml");
		expect(chapter).toContain('href="chapter-overview.xhtml#ownership"');
		expect(chapter).toContain('href="mechanism-triage.xhtml"');
		expect(chapter).toContain('href="https://drill.example/downloads"');
		expect(epub.paths).toContain("OEBPS/text/chapter-overview.xhtml");
		expect(epub.paths).toContain("OEBPS/text/mechanism-triage.xhtml");
		expect(chapter).toContain(
			"<code>max_retries</code> and watch _error_rate_ &amp; <em>latency</em>",
		);
	});

	it("pass the structural checks: well-formed XHTML, complete manifest, readable PDF", async () => {
		const runtime = createRuntime();
		expect(await inspectEpub(await bookEpub(runtime))).toEqual([]);
		expect(await inspectPdf(await bookPdf(runtime))).toEqual([]);
		for (const slug of ["overview", "next-steps"]) {
			const params = { params: { slug } };
			expect(
				await inspectEpub(
					await download(await runtime.exportRoutes.chapters.epub.GET(params)),
				),
			).toEqual([]);
			expect(
				await inspectPdf(
					await download(await runtime.exportRoutes.chapters.pdf.GET(params)),
				),
			).toEqual([]);
		}
	});

	it("give a chapter download its own identifier", async () => {
		const runtime = createRuntime();
		const chapter = await readEpub(
			await download(
				await runtime.exportRoutes.chapters.epub.GET({
					params: { slug: "overview" },
				}),
			),
		);
		expect(chapter.identifier).toBe(
			"urn:uuid:28a2d2a7-26e5-5d4b-a48a-da257d6e0db0",
		);
		expect(chapter.headings).toEqual(["Drill Book", "Contents", "Overview"]);
	});

	it("date a book with no release from SOURCE_DATE_EPOCH, never the clock", async () => {
		setSystemTime(new Date("2026-10-14T17:41:10.775Z"));
		const undated = await readEpub(
			await bookEpub(createRuntime({ releases: false })),
		);
		expect(undated.modified).toBe("1980-01-01T00:00:00Z");
		expect(undated.date).toBeUndefined();
		expect(await undated.read("OEBPS/title.xhtml")).toContain(
			'<p class="title-page__edition">Draft</p>',
		);

		process.env.SOURCE_DATE_EPOCH = "1767225600";
		const dated = await readEpub(
			await bookEpub(createRuntime({ releases: false })),
		);
		expect(dated.modified).toBe("2026-01-01T00:00:00Z");
	});

	it("build no PDF when the book turns it off, and still build the EPUB", async () => {
		const runtime = createRuntime({ exports: { pdf: false } });

		const book = await runtime.exportRoutes.book.pdf.GET();
		expect(book.body).toBeNull();
		expect(runtime.exportRoutes.chapters.pdf.getStaticPaths()).toEqual([]);
		expect(
			(
				await runtime.exportRoutes.chapters.pdf.GET({
					params: { slug: "overview" },
				})
			).body,
		).toBeNull();
		expect(runtime.getBookExportLinks().map((link) => link.href)).toEqual([
			"/exports/book.epub",
		]);
		expect(
			runtime
				.getChapterExportLinks("overview", "Overview")
				.map((link) => link.format),
		).toEqual(["epub"]);
		expect(await inspectEpub(await bookEpub(runtime))).toEqual([]);
		expect(runtime.exportRoutes.chapters.epub.getStaticPaths()).toHaveLength(2);
	});

	it("draw text in the font exports.pdfFont names, and name the setting when the file is missing", async () => {
		const font = createRequire(import.meta.url).resolve(
			"@fontsource/noto-sans/files/noto-sans-devanagari-400-normal.woff",
		);
		const withFont = (pdfFont: string) =>
			createBookExportHelpersFromConfig({
				bookConfig: {
					title: "Glyphs",
					exports: { pdfFont },
				},
				modules: {
					chapters: { "../content/book/chapters/a.mdx": "Placeholder: ◌" },
				},
				folders: { root: "/books/glyphs", publicDir: "/books/glyphs/public" },
			});
		const helpers = withFont(font);
		const pdf = await createPdfFromHelpers(helpers);
		// Helvetica draws the words and the book's font the placeholder, on one line.
		const runs = (await extractPdfText(pdf)).flat();
		const line = runs.filter((run) => run.y === runs.at(-1)?.y);
		expect(line.map((run) => run.text)).toEqual(["Placeholder: ", "◌"]);

		await expect(
			createPdfFromHelpers(withFont("fonts/missing.otf")),
		).rejects.toThrow(
			'exports.pdfFont in book.config.ts is "fonts/missing.otf", but there is no file at /books/glyphs/fonts/missing.otf.',
		);
	});

	it("carry images from public/ and from beside the content file", async () => {
		const root = mkdtempSync(join(tmpdir(), "bookkit-book-images-"));
		try {
			const png = new Resvg(
				'<svg xmlns="http://www.w3.org/2000/svg" width="8" height="4"><rect width="8" height="4"/></svg>',
			)
				.render()
				.asPng();
			mkdirSync(join(root, "public", "images"), { recursive: true });
			writeFileSync(join(root, "public", "images", "board.png"), png);
			mkdirSync(join(root, "src", "content", "book", "chapters", "img"), {
				recursive: true,
			});
			writeFileSync(
				join(root, "src", "content", "book", "chapters", "img", "flow.png"),
				png,
			);
			const warnings: string[] = [];
			const helpers = createBookExportHelpersFromConfig({
				bookConfig: { title: "Pictures" },
				modules: {
					chapters: {
						"../content/book/chapters/a.mdx":
							"![The board](/images/board.png)\n\n![The flow](./img/flow.png)",
					},
				},
				folders: { root, publicDir: join(root, "public") },
				onWarning: (message) => warnings.push(message),
			});
			const epub = await JSZip.loadAsync(await createEpubFromHelpers(helpers));
			expect(
				Object.keys(epub.files).filter((path) => path.includes("images/")),
			).toEqual(["OEBPS/images/board.png", "OEBPS/images/flow.png"]);
			expect(warnings).toEqual([]);
			expect(await inspectPdf(await createPdfFromHelpers(helpers))).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
