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
import { checkContentItem } from "../../packages/astro-bookkit/src/validators/content-check";
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
