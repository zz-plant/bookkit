import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createBookWorkspace, runBun } from "./lib/book-workspace.fixture";

/**
 * Pages every book shares take their copy from book.config.ts: the home page
 * (templates/book-app/src/pages/index.astro) from `home`, and the reading hub
 * (src/lib/read-hub.ts, read by src/pages/read/index.astro) from `readHub`. A
 * new book sets its own copy for both, builds, and its pages show it.
 */

const BOOK = "page-copy";

let workspace: string;
let appDir: string;
let build: { exitCode: number | null; output: string };

beforeAll(() => {
	({ workspace, appDir } = createBookWorkspace("home-page-", BOOK));
	const configPath = join(appDir, "src", "book.config.ts");
	const config = readFileSync(configPath, "utf8");
	const starterHome = config.match(/\thome: \{[\s\S]*?\n\t\},\n/)?.[0];
	const starterHub = config.match(/\treadHub: \{[\s\S]*?\n\t\},\n/)?.[0];
	if (!starterHome || !starterHub) {
		throw new Error(`No home or readHub block in ${configPath}`);
	}
	writeFileSync(
		configPath,
		config
			.replace(
				starterHome,
				`\thome: {
		kicker: "Field notes",
		mechanismsCard: {
			title: "Find your situation",
			description: "Start from what you can see.",
		},
	},
`,
			)
			.replace(
				starterHub,
				`\treadHub: {
		lede: "Pick up where the tide left you.",
		quickStartCards: [
			{
				title: "Walk the shoreline",
				description: "The overview, in ten minutes.",
				href: "/read/overview",
				recommended: true,
			},
		],
	},
`,
			),
	);
	build = runBun(["run", "build"], appDir);
}, 240_000);

afterAll(() => rmSync(workspace, { recursive: true, force: true }));

describe("pages with copy in book.config.ts", () => {
	it("builds", () => {
		expect(build.exitCode, build.output).toBe(0);
	});

	it("shows the reading hub's lede and cards from book.config.ts", () => {
		const html = readFileSync(
			join(appDir, "dist", "read", "index.html"),
			"utf8",
		);
		expect(html).toContain(
			'<p class="lede">Pick up where the tide left you.</p>',
		);
		expect(html).toContain(
			'<div class="quick-start-grid" aria-label="Where to start"><a class="card quick-start-card quick-start-card--recommended" href="/read/overview"><h2>Walk the shoreline</h2><p class="meta">The overview, in ten minutes.</p></a></div>',
		);
		expect(html).not.toContain("Read the chapters in order");
	});

	it("shows the kicker and mechanisms card from book.config.ts", () => {
		const html = readFileSync(join(appDir, "dist", "index.html"), "utf8");
		expect(html).toContain('<p class="hero-kicker">Field notes</p>');
		expect(html).toContain(
			'<a class="card" href="/read/mechanisms" data-funnel-step="home_quickstart_step_2"><h3>Find your situation</h3><p class="meta">Start from what you can see.</p></a>',
		);
		expect(html).not.toContain("Browse the mechanisms");
	});
});
