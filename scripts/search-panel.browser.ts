import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Browser, chromium, type Page } from "playwright";
import { repoRoot } from "./_lib";
import { resolveDistFile } from "./lib/a11y";

/**
 * The search field is a WAI-ARIA combobox over a listbox of results, so a
 * screen reader hears the result the arrow keys select. Runs in Playwright's
 * Chromium against a static build of on-call, so it is not part of
 * `bun run test`: run it with `bun run test:browser` (CI runs it in the
 * accessibility job, after `bunx playwright install chromium`).
 */

const BOOK = "on-call";
const QUERY = "rollback";
/** Each case loads a page and waits for the search index. */
const CASE_TIMEOUT = 30_000;

let outDir: string;
let server: ReturnType<typeof Bun.serve>;
let browser: Browser;
let page: Page;

beforeAll(async () => {
	outDir = mkdtempSync(join(tmpdir(), "bookkit-search-panel-"));
	const build = Bun.spawnSync(
		[process.execPath, "run", "build", "--outDir", outDir],
		{
			cwd: join(repoRoot(), "apps", BOOK),
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	if (build.exitCode !== 0) {
		throw new Error(
			`Building ${BOOK} failed:\n${build.stdout.toString()}${build.stderr.toString()}`,
		);
	}
	server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch(request) {
			const file = resolveDistFile(outDir, new URL(request.url).pathname);
			return file
				? new Response(Bun.file(file))
				: new Response("Not found", { status: 404 });
		},
	});
	browser = await chromium.launch();
}, 240_000);

afterAll(async () => {
	await browser?.close();
	server?.stop(true);
	rmSync(outDir, { recursive: true, force: true });
}, CASE_TIMEOUT);

const field = () => page.locator("[data-search-input]");
const options = () => page.locator("#search-results [role=option]");
const activeId = () => field().getAttribute("aria-activedescendant");
const selectedIds = () =>
	page
		.locator('#search-results [role=option][aria-selected="true"]')
		.evaluateAll((nodes) => nodes.map((node) => node.id));

/** Opens search on the home page and types the query, once the field has focus. */
const search = async (query: string) => {
	page = await browser.newPage();
	await page.goto(`http://127.0.0.1:${server.port}/`, {
		waitUntil: "networkidle",
	});
	await page.click("[data-search-toggle]");
	await page.waitForFunction(() =>
		document.activeElement?.matches("[data-search-input]"),
	);
	await page.keyboard.type(query);
	await page.waitForSelector("#search-results [role=option]");
};

describe("search panel", () => {
	it(
		"is a combobox controlling the results listbox, collapsed until there are results",
		async () => {
			page = await browser.newPage();
			await page.goto(`http://127.0.0.1:${server.port}/`);
			expect(await field().getAttribute("role")).toBe("combobox");
			expect(await field().getAttribute("aria-controls")).toBe(
				"search-results",
			);
			expect(await field().getAttribute("aria-expanded")).toBe("false");
			expect(await page.locator("#search-results").getAttribute("role")).toBe(
				"listbox",
			);
			await page.close();
		},
		CASE_TIMEOUT,
	);

	it(
		"selects the first result, points aria-activedescendant at it, and announces the count",
		async () => {
			await search(QUERY);
			const count = await options().count();
			expect(count).toBeGreaterThan(2);
			const first = await options().first().getAttribute("id");
			expect(await field().getAttribute("aria-expanded")).toBe("true");
			expect(await activeId()).toBe(first);
			expect(await selectedIds()).toEqual([first ?? ""]);
			expect(await page.locator("#search-status").textContent()).toBe(
				`${count} results`,
			);
			await page.close();
		},
		CASE_TIMEOUT,
	);

	it(
		"moves aria-activedescendant with ArrowDown and ArrowUp, wrapping at the ends",
		async () => {
			await search(QUERY);
			const ids = await options().evaluateAll((nodes) =>
				nodes.map((node) => node.id),
			);
			await page.keyboard.press("ArrowDown");
			expect(await activeId()).toBe(ids[1]);
			await page.keyboard.press("ArrowDown");
			expect(await activeId()).toBe(ids[2]);
			expect(await selectedIds()).toEqual([ids[2]]);
			await page.keyboard.press("ArrowUp");
			expect(await activeId()).toBe(ids[1]);
			await page.keyboard.press("ArrowUp");
			await page.keyboard.press("ArrowUp");
			expect(await activeId()).toBe(ids[ids.length - 1]);
			// Focus never leaves the field.
			expect(
				await page.evaluate(() =>
					document.activeElement?.matches("[data-search-input]"),
				),
			).toBe(true);
			await page.close();
		},
		CASE_TIMEOUT,
	);

	it(
		"opens the selected result with Enter",
		async () => {
			await search(QUERY);
			await page.keyboard.press("ArrowDown");
			const id = await activeId();
			const href = await page.locator(`#${id}`).getAttribute("href");
			expect(href).toBeTruthy();
			await page.keyboard.press("Enter");
			// The result links are absolute (toSafeUrl resolves them).
			await page.waitForURL((url) => url.href === href);
			await page.close();
		},
		CASE_TIMEOUT,
	);

	it(
		"collapses and clears aria-activedescendant when the field is emptied",
		async () => {
			await search(QUERY);
			await field().fill("");
			await page.waitForFunction(
				() =>
					document
						.querySelector("[data-search-input]")
						?.getAttribute("aria-expanded") === "false",
			);
			expect(await activeId()).toBeNull();
			expect(await options().count()).toBe(0);
			await page.close();
		},
		CASE_TIMEOUT,
	);
});
