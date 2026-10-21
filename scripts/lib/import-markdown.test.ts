import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	appendFileSync,
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseFrontmatter } from "../../packages/astro-bookkit/src/utils/frontmatter";
import type { UnsafeMarkupEntry } from "../../packages/astro-bookkit/src/utils/markdown";
import { checkContentItem } from "../../packages/astro-bookkit/src/validators/content-check";
import { CHILD_TEST_TIMEOUT_MS, runChild } from "./child-process.fixture";
import { compileMdx } from "./compile-mdx";
import {
	applyImport,
	type ImportPlan,
	MANIFEST_FILE,
	planImport,
} from "./import-markdown";
import { describeImport, nextSteps } from "./import-report";

/**
 * `fixtures/import-notes` is a notes folder as people keep one: numbered
 * files, a note with its own frontmatter, notes titled only by a heading or
 * only by their file name, links between notes, an image, a README, a drafts
 * folder, a `<details>` block, and braces and angle brackets in prose.
 */
const FIXTURE = join(import.meta.dir, "fixtures", "import-notes");

/** What import left out of a note, in brief: the line, what, and why. */
const leftOut = (chapter: { unsafeMarkup: UnsafeMarkupEntry[] }) =>
	chapter.unsafeMarkup.map((entry) => {
		switch (entry.kind) {
			case "link":
				return `${entry.line} link ${JSON.stringify(entry.href)}`;
			case "attribute":
				return `${entry.line} <${entry.element} ${entry.attribute}> ${entry.refusal}`;
			case "element":
				return `${entry.line} <${entry.element}> keeps ${entry.keeps}`;
			default:
				return `${entry.line} ${entry.kind}`;
		}
	});

/** Findings `bookkit check` has for a chapter import wrote. */
const unsafeFindings = (content: string) =>
	checkContentItem("chapter", content).findings.filter(
		(finding) =>
			finding.code === "UNSAFE_LINK" || finding.code === "UNSAFE_HTML",
	);
const BOOK = "notes-book";

let workspace: string;
let notes: string;
let chaptersDir: string;

const OVERVIEW = `---
slug: overview
status: draft
title: "Overview"
---

## Purpose
`;

beforeEach(() => {
	workspace = mkdtempSync(join(tmpdir(), "bookkit-import-"));
	chaptersDir = join(
		workspace,
		"apps",
		BOOK,
		"src",
		"content",
		"book",
		"chapters",
	);
	mkdirSync(chaptersDir, { recursive: true });
	writeFileSync(join(chaptersDir, "00-overview.mdx"), OVERVIEW);
	notes = join(workspace, "notes");
	cpSync(FIXTURE, notes, { recursive: true });
});

afterEach(() => rmSync(workspace, { recursive: true, force: true }));

const plan = (options: { force?: boolean; includeReadme?: boolean } = {}) =>
	planImport({
		workspaceRoot: workspace,
		book: BOOK,
		sourceDir: notes,
		...options,
	});

const chapter = (result: ImportPlan, source: string) => {
	const found = result.chapters.find((c) => c.source === source);
	if (!found) throw new Error(`no chapter planned for ${source}`);
	return found;
};

const frontmatterOf = (content: string) => {
	const parsed = parseFrontmatter(content);
	if (parsed.status !== "ok") throw new Error(`frontmatter: ${parsed.status}`);
	return parsed.data;
};

describe("planImport", () => {
	it("titles each chapter from its frontmatter, first heading, or file name — never a path", async () => {
		const result = await plan();
		expect(result.chapters.map((c) => [c.source, c.title])).toEqual([
			["01-why-handoffs-fail.md", "Why handoffs fail"],
			["02-shift-rhythm.md", "Shift rhythm"],
			["03-handoff-checklist.md", "Handoff checklist"],
			["04-context-glossary.md", "Context glossary"],
			["05-retro-notes.md", "Retro: the March outage"],
			["06-on-call-pay.md", 'Pay: "on call" is work'],
			["drafts/07-unfinished.md", "Unfinished thought"],
		]);
		for (const c of result.chapters) {
			expect(c.content).not.toContain(workspace);
			expect(c.content).not.toContain(tmpdir());
		}
	});

	it("uses ordering numbers for order, not for slugs", async () => {
		const result = await plan();
		expect(result.chapters.map((c) => [c.file, c.slug])).toEqual([
			["01-why-handoffs-fail.mdx", "why-handoffs-fail"],
			["02-shift-rhythm.mdx", "shift-rhythm"],
			["03-handoff-checklist.mdx", "handoff-checklist"],
			["04-context-glossary.mdx", "context-glossary"],
			["05-retro-notes.mdx", "retro-notes"],
			["06-on-call-pay.mdx", "on-call-pay"],
			["07-unfinished.mdx", "unfinished"],
		]);
	});

	it("maps the source's frontmatter onto the chapter's and reports the rest", async () => {
		const rhythm = chapter(await plan(), "02-shift-rhythm.md");
		expect(frontmatterOf(rhythm.content)).toEqual({
			slug: "shift-rhythm",
			status: "published",
			title: "Shift rhythm",
			summary: "The three beats of an on-call shift.",
		});
		expect(rhythm.leftOut).toEqual(["tags", "date", "author"]);
		const body = rhythm.content.replace(/^---[\s\S]*?\n---\n/, "");
		expect(body).not.toMatch(/tags:|author:|^# Shift rhythm/m);
	});

	it("imports drafts — a drafts folder or draft: true — as drafts", async () => {
		const result = await plan();
		expect(chapter(result, "drafts/07-unfinished.md").status).toBe("draft");
		expect(chapter(result, "06-on-call-pay.md").status).toBe("draft");
		expect(chapter(result, "01-why-handoffs-fail.md").status).toBe("published");
	});

	it("skips the README, and imports it with --include-readme", async () => {
		const result = await plan();
		expect(result.skipped).toEqual([
			{
				source: "README.md",
				reason: "folder index; --include-readme imports it as a chapter",
			},
		]);
		expect(result.chapters.some((c) => c.source === "README.md")).toBe(false);
		const included = await plan({ includeReadme: true });
		expect(chapter(included, "README.md").title).toBe("Notes index");
	});

	it("points links between notes at chapters and copies images", async () => {
		const result = await plan();
		const why = chapter(result, "01-why-handoffs-fail.md").content;
		expect(why).toContain(
			"[the handoff checklist](/read/chapters/handoff-checklist)",
		);
		expect(why).toContain("(/read/chapters/context-glossary#context-debt)");
		expect(why).toContain(
			"![The handoff board in the ops room](/images/handoff-board.png)",
		);
		expect(chapter(result, "02-shift-rhythm.md").content).toContain(
			"[checklist]: /read/chapters/handoff-checklist",
		);
		expect(chapter(result, "03-handoff-checklist.md").content).toContain(
			'<img src="/images/handoff-board.png" width="200" />',
		);
		expect(result.images).toEqual([
			{
				source: "img/handoff-board.png",
				file: "handoff-board.png",
				action: "new",
				reason: undefined,
			},
		]);
		expect(result.problems).toEqual([
			{
				source: "01-why-handoffs-fail.md",
				line: 5,
				message: "links to README.md, which is not imported (folder index)",
			},
		]);
	});

	it("writes chapters that pass the contract and compile as MDX", async () => {
		for (const c of (await plan()).chapters) {
			expect(checkContentItem("chapter", c.content).findings).toEqual([]);
			expect(c.compile).toEqual({ ok: true });
			expect(c.htmlAsText).toBe(false);
		}
	});

	it("keeps <details> as HTML and escapes braces and angle brackets in prose", async () => {
		const result = await plan();
		const retro = chapter(result, "05-retro-notes.md").content;
		expect(retro).toContain("<details>\n<summary>Timeline</summary>\n");
		expect(retro).toContain("<kbd>Ctrl</kbd>");
		const why = chapter(result, "01-why-handoffs-fail.md").content;
		expect(why).toContain("page \\<on-call-lead>");
		expect(why).toContain("takes \\<10 minutes and costs \\{nothing\\}");
		expect(why).toContain("`{service}`");
		expect(why).toContain("{/* reviewed after the March outage */}");
		expect(why).toContain("&#101;xport the timeline");
		expect(chapter(result, "02-shift-rhythm.md").content).toContain(
			'--note "{state}" <<EOF',
		);
	});

	it("writes valid YAML for a title or file name with quotes and colons", async () => {
		writeFileSync(join(notes, 'say "hi": now.md'), "Quote text.\n");
		const quoted = chapter(await plan(), 'say "hi": now.md');
		expect(frontmatterOf(quoted.content).title).toBe('Say "hi": now');
		expect(quoted.slug).toBe("say-hi-now");
		expect(checkContentItem("chapter", quoted.content).findings).toEqual([]);
	});

	it("keeps unreadable frontmatter out of the page but in the file", async () => {
		writeFileSync(
			join(notes, "08-broken.md"),
			"---\ntitle: [oops\n---\nBody.\n",
		);
		const result = await plan();
		const broken = chapter(result, "08-broken.md");
		expect(broken.content).toContain("{/*\n---\ntitle: [oops\n---\n*/}");
		expect(broken.compile).toEqual({ ok: true });
		expect(result.problems.map((p) => p.source)).toContain("08-broken.md");
	});

	it("keeps a link that would run code or carry a document as its text, and lists it with its line", async () => {
		writeFileSync(
			join(notes, "09-links.md"),
			[
				"---",
				"title: Links",
				"---",
				"# Links",
				"",
				"Run [the script](javascript:alert(1)) or [read it](https://example.com).",
				'Open <a href="&#106;avascript:alert(2)">the box</a> or [the page][page].',
				"",
				"[page]: data:text/html;base64,PHNjcmlwdD4=",
				"",
			].join("\n"),
		);
		const result = await plan();
		const links = chapter(result, "09-links.md");

		expect(links.content).toContain(
			"Run the script or [read it](https://example.com).",
		);
		expect(links.content).toContain("Open the box or the page.");
		expect(links.content).not.toMatch(/javascript|data:/);
		expect(links.compile).toEqual({ ok: true });
		expect(leftOut(links)).toEqual([
			'6 link "javascript:alert(1)"',
			"7 <a href> address",
			'7 link "data:text/html;base64,PHNjcmlwdD4="',
			'9 link "data:text/html;base64,PHNjcmlwdD4="',
		]);
		const report = describeImport(result, {
			dryRun: true,
			bookDir: `apps/${BOOK}`,
		}).join("\n");
		expect(report).toContain(
			'Addresses removed (a link keeps its words), since a book links only to http, https, mailto, tel, and ftp addresses and to its own pages (4):\n  09-links.md:6  "javascript:alert(1)"\n  09-links.md:7  "javascript:alert(2)"',
		);
	});

	it("drops the address of an element that would embed or submit to one, and lists it", async () => {
		writeFileSync(
			join(notes, "10-embeds.md"),
			[
				"# Embeds",
				"",
				'<iframe src="javascript:alert(1)"></iframe>',
				'<embed src="data:text/html,x">',
				'<object data="javascript:alert(2)">Fallback</object>',
				'<form action="javascript:alert(3)"><button formaction="javascript:alert(4)">Go</button></form>',
				'<IFRAME SRC="vbscript:x"></IFRAME>',
				"",
			].join("\n"),
		);
		const result = await plan();
		const embeds = chapter(result, "10-embeds.md");

		// An embed with no safe source goes. Import keeps none of the others
		// as HTML: they show as text, without the address.
		expect(embeds.content).toContain("\\<object>Fallback\\</object>");
		expect(embeds.content).not.toMatch(/javascript|vbscript|data:|iframe/i);
		expect(embeds.compile).toEqual({ ok: true });
		expect(unsafeFindings(embeds.content)).toEqual([]);
		expect(leftOut(embeds)).toEqual([
			"3 <iframe src> address",
			"4 <embed src> address",
			"5 <object data> address",
			"6 <form action> address",
			"6 <button formaction> address",
			"7 <iframe src> address",
		]);
		const report = describeImport(result, {
			dryRun: true,
			bookDir: `apps/${BOOK}`,
		}).join("\n");
		expect(report).toContain(
			'  10-embeds.md:3  <iframe src> "javascript:alert(1)", with the <iframe>\n  10-embeds.md:4  <embed src> "data:text/html,x"\n  10-embeds.md:5  <object data> "javascript:alert(2)"\n  10-embeds.md:6  <form action> "javascript:alert(3)"\n  10-embeds.md:6  <button formaction> "javascript:alert(4)"\n  10-embeds.md:7  <iframe src> "vbscript:x", with the <iframe>',
		);
	});

	it("leaves out a script, a style, and what a kept element may not carry, and lists each", async () => {
		writeFileSync(
			join(notes, "13-html.md"),
			[
				"# Pasted HTML",
				"",
				'<p align="center" onclick="alert(1)" style="color:red" data-resume-reading>Centered</p>',
				'<img src="https://example.com/a.png" alt="A chart" onerror="alert(2)">',
				"<script>alert(3)</script>",
				"<style>p { display: none }</style>",
				"Keys: <kbd>Ctrl</kbd>, and GET /users/<id>.",
				"",
			].join("\n"),
		);
		const result = await plan();
		const html = chapter(result, "13-html.md");
		expect(html.compile).toEqual({ ok: true });
		expect(html.content).toContain('<p align="center">Centered</p>');
		expect(html.content).toContain(
			'<img src="https://example.com/a.png" alt="A chart" />',
		);
		expect(html.content).toContain(
			"Keys: <kbd>Ctrl</kbd>, and GET /users/\\<id>.",
		);
		expect(html.content).not.toMatch(/alert|script|style|display|data-/);
		expect(unsafeFindings(html.content)).toEqual([]);
		expect(leftOut(html)).toEqual([
			"3 <p onclick> handler",
			"3 <p style> style",
			"3 <p data-resume-reading> unlisted",
			"4 <img onerror> handler",
			"5 <script> keeps nothing",
			"6 <style> keeps nothing",
		]);
		const report = describeImport(result, {
			dryRun: true,
			bookDir: `apps/${BOOK}`,
		});
		const at = report.findIndex((line) => line.startsWith("HTML left out"));
		expect(report.slice(at, at + 7)).toEqual([
			"HTML left out, since a book's content may lay out text, link, show images, and embed pages, but not run script or set its own style (6):",
			'  13-html.md:3  <p onclick="alert(1)">: an event handler',
			'  13-html.md:3  <p style="color:red">: inline style',
			"  13-html.md:3  <p data-resume-reading>: not one the element keeps",
			'  13-html.md:4  <img onerror="alert(2)">: an event handler',
			"  13-html.md:5  <script>, with what it holds",
			"  13-html.md:6  <style>, with what it holds",
		]);
	});

	it("keeps a video or a map embedded from the web, as YouTube, Vimeo, and Google Maps hand them out", async () => {
		const youtube =
			'<iframe width="560" height="315" src="https://www.youtube.com/embed/dQw4w9WgXcQ?si=abc" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>';
		const vimeo =
			'<iframe src="https://player.vimeo.com/video/76979871?h=8272103f6e" width="640" height="360" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>';
		const maps =
			'<iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3022.9!2d-73.98!3d40.75" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>';
		// Without its style, which a book's content does not set, and with a
		// title, which Google Maps leaves out and a screen reader needs.
		const mapsKept = maps
			.replace(' style="border:0;"', "")
			.replace("></iframe>", ' title="Google Maps map"></iframe>');
		// The address last in the tag: as text, GFM read it on through the `\\`
		// of `\\</iframe>`, and the chapter did not compile.
		const short = '<iframe src="https://www.youtube.com/embed/abc"></iframe>';
		const shortKept = short.replace(
			"></iframe>",
			' title="YouTube video"></iframe>',
		);
		writeFileSync(
			join(notes, "11-videos.md"),
			[
				"# Videos",
				"",
				youtube,
				"",
				vimeo,
				'<p><a href="https://vimeo.com/76979871">The New Vimeo Player</a> from <a href="https://vimeo.com/staff">Vimeo</a>.</p>',
				"",
				maps,
				"",
				short,
				"",
				'<iframe srcdoc="<script>alert(1)</script>" src="https://example.com/embed"></iframe>',
				"",
				'<iframe src="javascript:alert(2)"></iframe>',
				"",
			].join("\n"),
		);
		const result = await plan();
		const videos = chapter(result, "11-videos.md");
		expect(videos.compile).toEqual({ ok: true });
		expect(videos.htmlAsText).toBe(false);
		for (const embed of [youtube, mapsKept, shortKept]) {
			expect(videos.content).toContain(embed);
		}
		expect(videos.content).toContain(
			'<iframe src="https://example.com/embed" title="Embedded page from example.com"></iframe>',
		);
		// Vimeo's snippet has no title either.
		expect(videos.content).toContain(
			vimeo.replace("></iframe>", ' title="Vimeo video"></iframe>'),
		);
		// The unsafe one is left out.
		expect(videos.content).not.toContain("\\<iframe");
		expect(videos.content).not.toMatch(/javascript|srcdoc|<script|style=/i);
		expect(unsafeFindings(videos.content)).toEqual([]);
		expect(leftOut(videos)).toEqual([
			"8 <iframe style> style",
			"12 <iframe srcdoc> document",
			"14 <iframe src> address",
		]);
		expect(videos.changes.titles).toBe(4);
		expect(
			describeImport(result, { dryRun: true, bookDir: `apps/${BOOK}` }),
		).toContain(
			"4 embeds with no title were each given one from the page it shows, so a screen reader can name it: 11-videos.md.",
		);
	});

	it("compiles an address followed by a placeholder or an escaped tag", async () => {
		writeFileSync(
			join(notes, "12-api.md"),
			[
				"# API",
				"",
				"GET https://api.example.com/users/<id> to read one.",
				"",
				'<video src="https://example.com/clip.mp4"></video>',
				"",
			].join("\n"),
		);
		const api = chapter(await plan(), "12-api.md");
		expect(api.compile).toEqual({ ok: true });
		expect(api.content).toContain(
			"GET https\\://api.example.com/users/\\<id> to read one.",
		);
		expect(api.content).toContain(
			'\\<video src="https\\://example.com/clip.mp4">\\</video>',
		);
	});

	it("writes nothing when only planned (--dry-run)", async () => {
		await plan();
		expect(readdirSync(chaptersDir)).toEqual(["00-overview.mdx"]);
		expect(existsSync(join(workspace, "apps", BOOK, "public"))).toBe(false);
	});
});

describe("re-importing", () => {
	it("leaves an unchanged import alone", async () => {
		await applyImport(await plan());
		const again = await plan();
		expect(new Set(again.chapters.map((c) => c.action))).toEqual(
			new Set(["unchanged"]),
		);
		expect(again.images.map((i) => i.action)).toEqual(["unchanged"]);
	});

	it("updates in place, appends new notes, and keeps chapters edited since import", async () => {
		await applyImport(await plan());
		appendFileSync(
			join(chaptersDir, "03-handoff-checklist.mdx"),
			"\nMy edit.\n",
		);
		appendFileSync(join(notes, "02-shift-rhythm.md"), "\nOne more line.\n");
		writeFileSync(join(notes, "02b-new-idea.md"), "# New idea\n\nText.\n");

		const again = await plan();
		const actions = Object.fromEntries(
			again.chapters.map((c) => [c.source, [c.action, c.file]]),
		);
		expect(actions["02-shift-rhythm.md"]).toEqual([
			"update",
			"02-shift-rhythm.mdx",
		]);
		expect(actions["03-handoff-checklist.md"]).toEqual([
			"keep",
			"03-handoff-checklist.mdx",
		]);
		expect(actions["02b-new-idea.md"]).toEqual(["new", "08-new-idea.mdx"]);
		expect(actions["01-why-handoffs-fail.md"]).toEqual([
			"unchanged",
			"01-why-handoffs-fail.mdx",
		]);
		// One chapter per slug: nothing was renumbered or written twice.
		await applyImport(again);
		const slugs = readdirSync(chaptersDir)
			.filter((f) => f.endsWith(".mdx"))
			.map(
				(f) => frontmatterOf(readFileSync(join(chaptersDir, f), "utf8")).slug,
			);
		expect(slugs.length).toBe(new Set(slugs).size);
		expect(
			readFileSync(join(chaptersDir, "03-handoff-checklist.mdx"), "utf8"),
		).toContain("My edit.");

		const dryRun = describeImport(await plan(), {
			dryRun: true,
			bookDir: `apps/${BOOK}`,
		}).join("\n");
		expect(dryRun).toContain(
			"edited since import; import would keep it (--force replaces it)",
		);

		const forced = await plan({ force: true });
		expect(chapter(forced, "03-handoff-checklist.md").action).toBe("replace");
		await applyImport(forced);
		expect(
			readFileSync(join(chaptersDir, "03-handoff-checklist.mdx"), "utf8"),
		).not.toContain("My edit.");
	});

	it("never overwrites a chapter import did not write, unless forced", async () => {
		writeFileSync(
			join(chaptersDir, "05-mine.mdx"),
			"---\nslug: shift-rhythm\nstatus: draft\ntitle: Mine\n---\n\nMine.\n",
		);
		const result = await plan();
		expect(chapter(result, "02-shift-rhythm.md")).toMatchObject({
			action: "keep",
			file: "05-mine.mdx",
			reason:
				"chapters/05-mine.mdx exists and import has no record of writing it",
		});
		await applyImport(result);
		expect(readFileSync(join(chaptersDir, "05-mine.mdx"), "utf8")).toContain(
			"Mine.",
		);
		const manifest = JSON.parse(
			readFileSync(join(chaptersDir, MANIFEST_FILE), "utf8"),
		);
		expect(
			manifest.chapters.map((e: { file: string }) => e.file),
		).not.toContain("05-mine.mdx");
	});
});

describe("describeImport", () => {
	it("names the chapter file, line, and source for a chapter that does not compile", async () => {
		const result = await plan();
		const retro = chapter(result, "05-retro-notes.md");
		retro.compile = await compileMdx(
			`${retro.content}\nBroken {\n`,
			result.appDir,
		);
		const report = describeImport(result, {
			dryRun: false,
			bookDir: `apps/${BOOK}`,
		});
		expect(report.join("\n")).toMatch(
			/✗ apps\/notes-book\/src\/content\/book\/chapters\/05-retro-notes\.mdx:\d+:\d+ \(from 05-retro-notes\.md\) does not compile as MDX: /,
		);
	});
});

describe("compileMdx", () => {
	it("reports the line in the file, frontmatter included", async () => {
		const result = await compileMdx(
			"---\ntitle: x\n---\n\nFine.\n\n<details>\n",
			join(import.meta.dir, "..", "..", "apps", "on-call"),
		);
		expect(result).toMatchObject({ ok: false, line: 7 });
	});

	it(
		"uses the installed compiler, downloading nothing, for a book with no node_modules above it",
		() => {
			// Bun would resolve the book's @astrojs/mdx by downloading the latest
			// into this empty cache, as the validate-book tests' scratch books did.
			const cache = mkdtempSync(join(tmpdir(), "bookkit-empty-cache-"));
			const book = mkdtempSync(join(tmpdir(), "bookkit-loose-book-"));
			try {
				const result = runChild(
					[
						process.execPath,
						"-e",
						`import { compileMdx } from ${JSON.stringify(join(import.meta.dir, "compile-mdx.ts"))};\nconsole.log(JSON.stringify(await compileMdx("Fine.\\n\\n<details>\\n", ${JSON.stringify(book)})));`,
					],
					{ env: { ...process.env, BUN_INSTALL_CACHE_DIR: cache } },
				);
				expect(JSON.parse(result.stdout), result.output).toMatchObject({
					ok: false,
					line: 3,
				});
				expect(readdirSync(cache)).toEqual([]);
			} finally {
				rmSync(cache, { recursive: true, force: true });
				rmSync(book, { recursive: true, force: true });
			}
		},
		CHILD_TEST_TIMEOUT_MS,
	);
});

describe("nextSteps", () => {
	it("names the imported book in commands the bookkit CLI runs", () => {
		const steps = nextSteps({
			book: BOOK,
			sourceArg: "./notes",
			dryRun: false,
			inRepo: true,
		}).join("\n");
		expect(steps).toContain(`bun run bookkit dev ${BOOK}`);
		expect(steps).toContain(`bun run bookkit check ${BOOK} --quick`);
		expect(steps).toContain(`bun run bookkit propose ${BOOK}`);
		expect(steps).not.toMatch(/new:mechanism|validate -- --book/);
	});

	it("after a dry run, gives the command that runs the import", () => {
		const steps = nextSteps({
			book: BOOK,
			sourceArg: "my notes",
			dryRun: true,
			inRepo: true,
			includeReadme: true,
		});
		expect(steps).toContain(
			`  bun run bookkit import ${BOOK} --dir 'my notes' --include-readme  run the import`,
		);
	});

	it("uses the package scripts of a project made by create-bookkit", () => {
		const steps = nextSteps({
			book: BOOK,
			sourceArg: "./notes",
			dryRun: false,
			inRepo: false,
		}).join("\n");
		expect(steps).toContain(`bun run suggest -- --book ${BOOK}`);
		expect(steps).toContain("bun run dev");
		expect(steps).not.toContain("bookkit");
	});
});
