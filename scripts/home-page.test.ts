import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createBookWorkspace, runBun } from "./lib/book-workspace.fixture";

/**
 * The home page every book shares (templates/book-app/src/pages/index.astro)
 * takes its copy from `home` in book.config.ts. A new book sets its own
 * kicker and mechanisms card, builds, and its home page shows them.
 */

const BOOK = "home-copy";

let workspace: string;
let appDir: string;
let build: { exitCode: number | null; output: string };

beforeAll(() => {
	({ workspace, appDir } = createBookWorkspace("home-page-", BOOK));
	const configPath = join(appDir, "src", "book.config.ts");
	const config = readFileSync(configPath, "utf8");
	const starterHome = config.match(/\thome: \{[\s\S]*?\n\t\},\n/)?.[0];
	if (!starterHome) throw new Error(`No home block in ${configPath}`);
	writeFileSync(
		configPath,
		config.replace(
			starterHome,
			`\thome: {
		kicker: "Field notes",
		mechanismsCard: {
			title: "Find your situation",
			description: "Start from what you can see.",
		},
	},
`,
		),
	);
	build = runBun(["run", "build"], appDir);
}, 240_000);

afterAll(() => rmSync(workspace, { recursive: true, force: true }));

describe("home page", () => {
	it("builds", () => {
		expect(build.exitCode, build.output).toBe(0);
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
