import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import axe from "axe-core";
import { type Browser, chromium, type Page } from "playwright";
import { listBookDirs, repoRoot } from "./_lib";
import {
	AXE_TAGS,
	type AxeViolation,
	type Finding,
	formatFindings,
	isFailing,
	resolveDistFile,
	selectPages,
	VARIANTS,
	type Variant,
} from "./lib/a11y";
import { booksFromArgv } from "./lib/book-args";
import { exitOnHelp } from "./lib/cli";

/**
 * Runs axe-core in Chromium over one page of each type in a built book (see
 * PAGE_TYPES in scripts/lib/a11y.ts) and over the home page with each panel
 * open (menu, search results, "Continue" after a chapter, keyboard
 * shortcuts), in light and dark, at
 * desktop and phone widths. Fails on serious or critical violations and
 * prints the others as warnings. axe-core and Playwright are pinned, the
 * pages are fixed, and nothing outside the local server loads, so every run
 * of the same build gives the same answer.
 *
 * Needs Playwright's Chromium: `bunx playwright install chromium`.
 */

exitOnHelp({
	summary:
		"Runs axe-core in Chromium over one page of each type in a built book,\nand over the home page with each panel open, in light and dark, at\ndesktop and phone widths. Fails on serious or critical violations.",
	usage: ["bun run check:a11y [--book <book>] [--no-build]"],
	options: [
		["--book <book>", "One book (default: every book)"],
		["--no-build", "Check the dist/ already there instead of building first"],
	],
	notes: "Needs Playwright's Chromium: bunx playwright install chromium.",
	examples: [
		"bun run check:a11y",
		"bun run check:a11y -- --book on-call --no-build",
	],
});

const USAGE = "bun run check:a11y [--book <book>] [--no-build]";
const root = repoRoot();
const { books } = booksFromArgv(listBookDirs(), { usage: USAGE });
const build = !process.argv.includes("--no-build");

/** Builds the books side by side, as `build:all` does. */
const buildBooks = (names: string[]) => {
	console.log(`Building ${names.join(", ")}...`);
	const result = Bun.spawnSync(
		[
			"bun",
			"run",
			...names.flatMap((name) => ["--filter", `@books/${name}`]),
			"build",
		],
		{ cwd: root, stdout: "pipe", stderr: "pipe" },
	);
	if (result.exitCode !== 0) {
		console.error(`${result.stdout.toString()}${result.stderr.toString()}`);
		console.error("The build failed; its output is above.");
		process.exit(1);
	}
};

/** Opens the menu from the header, or from the action bar on a phone. */
const openMenu = (page: Page, variant: Variant) =>
	page.click(
		variant.mobile ? "[data-mobile-menu]" : "[data-site-nav-more-toggle]",
	);

/** Panels that are closed when a page loads, each opened on the home page. */
const PANELS: {
	label: string;
	open: (page: Page, variant: Variant, query: string) => Promise<void>;
}[] = [
	{
		label: "menu open",
		open: async (page, variant) => {
			await openMenu(page, variant);
			await page.click(".reader-settings__toggle");
			const settings = page.locator(".site-settings__toggle");
			if ((await settings.count()) > 0) await settings.click();
		},
	},
	{
		label: "search results",
		open: async (page, variant, query) => {
			await page.click(
				variant.mobile ? "[data-mobile-search]" : "[data-search-toggle]",
			);
			// The panel focuses its field once the index has loaded; typing
			// before then races the panel restoring the last query.
			await page.waitForFunction(() =>
				document.activeElement?.matches("[data-search-input]"),
			);
			await page.fill("[data-search-input]", query);
			await page.waitForSelector(
				"[data-search-results] [role=option], [data-search-empty]:not([hidden])",
			);
		},
	},
	{
		// "Continue: <chapter>", shown once the reader has opened a chapter.
		label: "continue reading",
		open: async (page) => {
			const chapter = await page.evaluate(
				() =>
					JSON.parse(
						document.querySelector<HTMLElement>("[data-resume-reading]")
							?.dataset.resumeChapters ?? "[]",
					)[0]?.href as string | undefined,
			);
			if (!chapter) return;
			const home = page.url();
			await page.goto(new URL(chapter, home).href, {
				waitUntil: "networkidle",
			});
			await page.goto(home, { waitUntil: "networkidle" });
			await page.waitForSelector("[data-resume-reading]:not([hidden])");
		},
	},
	{
		label: "keyboard shortcuts",
		open: async (page, variant) => {
			// A touch-only phone's menu leaves the button out; a keyboard
			// attached to it still opens the panel with "?".
			if (variant.mobile) {
				await page.keyboard.press("?");
			} else {
				await openMenu(page, variant);
				await page.click("[data-kbd-toggle]");
			}
			await page.waitForSelector("[data-kbd-panel]:not([hidden])");
		},
	},
];

/** A word the search finds: the first one of three letters or more in the first title it indexes. */
const searchQuery = (distDir: string): string => {
	const index = JSON.parse(
		readFileSync(join(distDir, "search-index.json"), "utf8"),
	) as { entries?: { title?: string }[] };
	const title = index.entries?.[0]?.title ?? "";
	return title.match(/\p{L}{3,}/u)?.[0] ?? "the";
};

/** Serves `distDir` as a static host does, with 404.html for anything missing. */
const serve = (distDir: string) =>
	Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch(request) {
			const file = resolveDistFile(distDir, new URL(request.url).pathname);
			if (file) return new Response(Bun.file(file));
			const notFound = join(distDir, "404.html");
			return new Response(Bun.file(notFound), { status: 404 });
		},
	});

const checkBook = async (
	browser: Browser,
	book: string,
): Promise<{ findings: Finding[]; checked: number }> => {
	const distDir = join(root, "apps", book, "dist");
	if (!existsSync(join(distDir, "index.html"))) {
		console.error(
			`apps/${book}/dist has no index.html. Build the book first (bun run build:all), or run without --no-build.`,
		);
		process.exit(1);
	}
	const { pages, missing } = selectPages(distDir);
	if (missing.length > 0) {
		console.log(`${book}: no page to check for ${missing.join(", ")}`);
	}

	const query = searchQuery(distDir);
	const server = serve(distDir);
	const origin = `http://127.0.0.1:${server.port}`;
	const findings: Finding[] = [];
	try {
		await Promise.all(
			VARIANTS.map(async (variant) => {
				const context = await browser.newContext({
					colorScheme: variant.colorScheme,
					viewport: variant.viewport,
					isMobile: variant.mobile,
					hasTouch: variant.mobile,
					reducedMotion: "reduce",
				});
				// Only the book itself loads, so a run cannot depend on the network.
				await context.route(
					(url) => url.origin !== origin,
					(route) => route.abort(),
				);
				const page = await context.newPage();
				const views = [
					...pages.map(({ path }) => ({ path, label: path, open: undefined })),
					...PANELS.map((panel) => ({
						path: "/",
						label: `/ (${panel.label})`,
						open: panel.open,
					})),
				];
				for (const view of views) {
					await page.goto(`${origin}${view.path}`, {
						waitUntil: "networkidle",
					});
					await view.open?.(page, variant, query);
					await page.evaluate(() => document.fonts.ready.then(() => {}));
					await page.addScriptTag({ content: axe.source });
					const violations = await page.evaluate(
						(tags) =>
							(window as unknown as { axe: typeof axe }).axe
								.run(document, { runOnly: { type: "tag", values: tags } })
								.then((results) => results.violations),
						AXE_TAGS,
					);
					for (const violation of violations as AxeViolation[]) {
						findings.push({
							book,
							page: view.label,
							variant: variant.label,
							violation,
						});
					}
				}
				await context.close();
			}),
		);
	} finally {
		server.stop(true);
	}
	return { findings, checked: pages.length + PANELS.length };
};

if (build) buildBooks(books);

let browser: Browser;
try {
	browser = await chromium.launch();
} catch (error) {
	console.error(String(error instanceof Error ? error.message : error));
	console.error(
		"Playwright's Chromium is not installed. Run `bunx playwright install chromium`, then run check:a11y again.",
	);
	process.exit(1);
}

const findings: Finding[] = [];
let checked = 0;
try {
	// Each book has its own server and contexts, so they run side by side.
	for (const result of await Promise.all(
		books.map((book) => checkBook(browser, book)),
	)) {
		findings.push(...result.findings);
		checked += result.checked;
	}
} finally {
	await browser.close();
}

const failing = findings.filter((finding) => isFailing(finding.violation));
const warnings = findings.filter((finding) => !isFailing(finding.violation));
const scope = `${checked} page(s) and panel(s) in ${books.length} book(s), ${VARIANTS.length} variants each (${VARIANTS.map((variant) => variant.label).join("; ")})`;

if (warnings.length > 0) {
	console.log("\nWarnings (moderate or minor; these do not fail the check):");
	for (const line of formatFindings(warnings)) console.log(line);
}
if (failing.length > 0) {
	console.error("\nSerious or critical violations:");
	for (const line of formatFindings(failing)) console.error(line);
	console.error(`\nAccessibility check failed. Checked ${scope}.`);
	process.exit(1);
}
console.log(`\nAccessibility check passed. Checked ${scope}.`);
