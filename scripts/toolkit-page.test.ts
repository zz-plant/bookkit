import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createBookWorkspace, runBun } from "./lib/book-workspace.fixture";
import { starterSlugs } from "./lib/scaffold-book";
import {
	definitionPairs,
	exportedToolSections,
	toolPageContent,
	toolPageSections,
} from "./lib/toolkit-page.fixture";

/**
 * The toolkit page (templates/book-app/src/pages/read/toolkit/[slug].astro)
 * in a new book: a plain action renders exactly as it did before runbook
 * fields were shown, and a procedure shows those fields in the order the PDF
 * and EPUB print them. on-call's procedures are checked in static-build.test.ts.
 */

const BOOK = "procedures";
const { mechanism } = starterSlugs(BOOK);

let workspace: string;
let appDir: string;
let build: { exitCode: number | null; output: string };

const tool = (name: string, frontmatter: string, body: string) =>
	writeFileSync(
		join(
			appDir,
			"src",
			"content",
			"book",
			"toolkit",
			`${mechanism}--${name}.mdx`,
		),
		`---\n${frontmatter.trim()}\n---\n\n${body}\n`,
	);

const page = (slug: string) =>
	readFileSync(
		join(appDir, "dist", "read", "toolkit", slug, "index.html"),
		"utf8",
	);

beforeAll(() => {
	({ workspace, appDir } = createBookWorkspace("toolkit-page-", BOOK));
	tool(
		"plain-action",
		`
slug: plain-action
status: draft
mechanism: ${mechanism}
name: "Plain action"
trigger: "The reply names no date."
timeboxMinutes: 5
steps:
  - "Write down the date you were promised."
  - "Ask who owns the decision."
failureLooksLike:
  - "The reply names no owner."
legitimateDemand:
  - "A named owner and a decision date."
`,
		"Ask once, in writing.",
	);
	tool(
		"procedure",
		`
slug: procedure
status: draft
mechanism: ${mechanism}
name: "Procedure"
owner: release-eng
reviewEveryDays: 1
trigger: "A deploy is about to start."
steps:
  - "Name the rollback candidate."
runbookSteps:
  - when: "The deploy is failing"
    action: "Run the rollback."
  - action: "Post the outcome in the deploy thread."
escalation:
  to: "release-manager"
  when: "No rollback candidate exists."
drills:
  - "Roll back a staging deploy."
`,
		"## Notes\n\nKeep the thread open until metrics recover.",
	);
	build = runBun(["run", "build"], appDir);
}, 240_000);

afterAll(() => rmSync(workspace, { recursive: true, force: true }));

describe("toolkit page", () => {
	it("builds", () => {
		expect(build.exitCode, build.output).toBe(0);
	});

	it("renders an action without runbook fields as it did before", () => {
		expect(toolPageContent(page("plain-action"))).toBe(
			`<h1 id="plain-action">Plain action</h1><p class="lede">5 minutes · for <a href="/read/mechanisms/${mechanism}">Starter mechanism</a></p><section class="content-block"><h2>When to use this</h2><p>The reply names no date.</p></section><section class="content-block"><h2>Steps</h2><ol class="step-list"><li class="step-card"><span class="step-card__number">1</span><span>Write down the date you were promised.</span></li><li class="step-card"><span class="step-card__number">2</span><span>Ask who owns the decision.</span></li></ol></section><section class="content-block"><h2>Failure looks like</h2><ul><li>The reply names no owner.</li></ul></section><section class="content-block"><h2>Legitimate demand</h2><ul><li>A named owner and a decision date.</li></ul></section><section class="content-block"><p>Ask once, in writing.</p></section>`,
		);
	});

	it("shows a procedure's owner, situations, escalation and drills in the export's order", () => {
		const html = page("procedure");
		expect(toolPageSections(html)).toEqual([
			"When to use this",
			"Steps",
			"Steps by situation",
			"Escalation",
			"Drills",
			"Notes",
		]);
		expect(toolPageSections(html)).toEqual(
			exportedToolSections(appDir).get("procedure") ?? [],
		);

		const lists = [
			...toolPageContent(html).matchAll(
				/<dl class="([^"]+)">([\s\S]*?)<\/dl>/g,
			),
		].map(([, className, dl]) => [className, definitionPairs(dl)]);
		expect(lists).toEqual([
			[
				"fact-list fact-list--lead",
				[
					["Owner", "release-eng"],
					["Review", "Every 1 day"],
				],
			],
			[
				"situation-list",
				[
					["The deploy is failing", "Run the rollback."],
					// A step with no condition applies whatever the situation.
					["In any situation", "Post the outcome in the deploy thread."],
				],
			],
			[
				"fact-list",
				[
					["To", "release-manager"],
					["When", "No rollback candidate exists."],
				],
			],
		]);
		expect(html).toContain(
			"<h2>Drills</h2><ul><li>Roll back a staging deploy.</li></ul>",
		);
	});
});
