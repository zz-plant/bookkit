import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildBook, createBookWorkspace } from "./lib/book-workspace.fixture";

/**
 * Pages every book shares take their copy from book.config.ts: the home page
 * (packages/astro-bookkit/src/routes/pages/index.astro) from `home`, the reading hub
 * (src/routes/read-hub.ts, read by src/routes/pages/read/index.astro) from `readHub`,
 * and the mechanisms index (src/routes/pages/read/mechanisms/index.astro) from
 * `mechanismsIndex`. A new book sets its own copy for each, builds, and its
 * pages show it.
 */

const BOOK = "page-copy";

let workspace: string;
let appDir: string;
let build: { exitCode: number | null; output: string };

beforeAll(() => {
	({ workspace, appDir } = createBookWorkspace("page-copy-", BOOK));
	const configPath = join(appDir, "src", "book.config.ts");
	const config = readFileSync(configPath, "utf8");
	// The starter leaves the pages' copy to the engine's defaults, so the
	// book's own copy goes after its last required field.
	const anchor = "\tglossaryFocus: [],\n";
	if (!config.includes(anchor)) {
		throw new Error(`No glossaryFocus: [] line in ${configPath}`);
	}
	// A second mechanism, not in book.config.ts and first by title, so the
	// urgency order and the tags that tell mechanisms apart show.
	const mechanisms = join(appDir, "src", "content", "book", "mechanisms");
	const starter = readdirSync(mechanisms)[0];
	writeFileSync(
		join(mechanisms, "a-second-pattern.mdx"),
		readFileSync(join(mechanisms, starter), "utf8")
			.replace(/^slug: .*$/m, "slug: a-second-pattern")
			.replace(/^title: .*$/m, "title: A second pattern"),
	);
	writeFileSync(
		configPath,
		config.replace(
			anchor,
			`${anchor}\thome: {
		kicker: "Field notes",
		mechanismsCard: {
			title: "Find your situation",
			description: "Start from what you can see.",
		},
	},
	mechanismsIndex: {
		lede: "The patterns this shore shows.",
		urgency: { "${BOOK}-starter-mechanism": "urgent" },
	},
	readHub: {
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
	build = buildBook(appDir);
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

	it("lists mechanisms by the urgency in book.config.ts, under its lede", () => {
		const html = readFileSync(
			join(appDir, "dist", "read", "mechanisms", "index.html"),
			"utf8",
		);
		expect(html).toContain(
			'<p class="lede">The patterns this shore shows.</p>',
		);
		const list = html.slice(
			html.indexOf("data-list-container"),
			html.indexOf("<h2>Then pick an action</h2>"),
		);
		const titles = [...list.matchAll(/<strong>([^<]+)<\/strong>/g)].map(
			(match) => match[1],
		);
		expect(titles).toEqual(["Starter mechanism", "A second pattern"]);
		expect(html).toContain(
			'<span class="eyebrow">urgent</span></div><strong>Starter mechanism</strong>',
		);
		expect(html).toContain('data-quick-filter="urgent"');
		expect(html).toContain("<h2>Then pick an action</h2>");
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
