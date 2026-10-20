import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { Browser, Page } from "playwright";
import {
	type BuiltBook,
	CLOSE_TIMEOUT_MS,
	OPEN_TIMEOUT_MS,
	openBuiltBook,
} from "./lib/browser.fixture";

/**
 * The search field is a WAI-ARIA combobox over a listbox of results, so a
 * screen reader hears the result the arrow keys select. A reader paged by an
 * alert finds the procedure first, by its name or by the words of its
 * trigger, and a mistyped procedure address offers that search. Runs in
 * Playwright's Chromium against a static build of on-call, so it is not part
 * of `bun run test`: run it with `bun run test:browser` (CI runs it in the
 * accessibility job, after `bunx playwright install chromium`).
 */

const BOOK = "on-call";
const QUERY = "rollback";
/** Each case loads a page and waits for the search index. */
const CASE_TIMEOUT = 30_000;

let book: BuiltBook | undefined;
let origin: string;
let browser: Browser;
let page: Page;

beforeAll(async () => {
	book = await openBuiltBook(BOOK);
	({ origin, browser } = book);
}, OPEN_TIMEOUT_MS);

afterAll(() => book?.close(), CLOSE_TIMEOUT_MS);

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
	await page.goto(`${origin}/`, {
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
			await page.goto(`${origin}/`);
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

const PROCEDURE = "/read/toolkit/classify-alert-severity";
/** The section each result names, in list order. */
const sections = () =>
	page
		.locator("#search-results [role=option] .search-panel__item-section")
		.allTextContents();
const optionPaths = () =>
	options().evaluateAll((nodes) =>
		nodes.map((node) => {
			const url = new URL((node as HTMLAnchorElement).href);
			return `${url.pathname}${url.hash}`;
		}),
	);

describe("finding a procedure", () => {
	it(
		"lists the procedure named by the query first, opening at its title",
		async () => {
			await search("severity");
			const paths = await optionPaths();
			expect(paths[0]).toBe(PROCEDURE);
			expect(await sections()).toEqual(
				expect.arrayContaining(["Toolkit", "Glossary", "Chapters"]),
			);
			expect((await sections())[0]).toBe("Toolkit");
			await page.close();
		},
		CASE_TIMEOUT,
	);

	it(
		"finds the procedure by the words of its trigger and steps",
		async () => {
			for (const query of ["pager", "sev-1"]) {
				await search(query);
				expect(await optionPaths(), query).toContain(PROCEDURE);
				await page.close();
			}
		},
		CASE_TIMEOUT,
	);

	it(
		"offers, on a mistyped address, a search for its words that finds the page",
		async () => {
			page = await browser.newPage();
			const response = await page.goto(
				`${origin}/read/toolkit/classify-severity/`,
				{ waitUntil: "networkidle" },
			);
			expect(response?.status()).toBe(404);
			const button = page.locator("main [data-search-open]");
			await expect(button.textContent()).resolves.toBe(
				"Search for “classify severity”",
			);
			await button.click();
			await page.waitForSelector("#search-results [role=option]");
			expect((await optionPaths())[0]).toBe(PROCEDURE);
			for (const section of ["/read/toolkit", "/read/chapters", "/read"]) {
				expect(
					await page.locator(`main a[href="${section}"]`).count(),
					section,
				).toBe(1);
			}
			await page.close();
		},
		CASE_TIMEOUT,
	);
});

describe("one list of results", () => {
	it(
		"lists every result in one listbox in score order, each naming its section",
		async () => {
			// "rollback" matches a chapter, a mechanism, and an action by
			// title. Grouped by section, the action came twelfth, after every
			// chapter section that mentions a rollback.
			await search("rollback");
			const paths = await optionPaths();
			expect(paths.slice(0, 3)).toEqual([
				"/read/chapters/rollback-first",
				"/read/mechanisms/rollback-first-change",
				"/read/toolkit/identify-rollback-candidate",
			]);
			expect((await sections()).slice(0, 3)).toEqual([
				"Chapters",
				"Mechanisms",
				"Toolkit",
			]);
			// The listbox owns its options directly: no groups, no headings.
			expect(
				await page
					.locator("#search-results")
					.evaluate((listbox) =>
						Array.from(listbox.children).map((child) =>
							child.getAttribute("role"),
						),
					),
			).toEqual(paths.map(() => "option"));
			expect(await page.locator("#search-results h3").count()).toBe(0);
			expect(await sections()).toHaveLength(paths.length);
			await page.close();
		},
		CASE_TIMEOUT,
	);
});
