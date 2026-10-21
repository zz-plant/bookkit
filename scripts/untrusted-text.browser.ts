import { describe, expect } from "bun:test";
import type { BrowserContext, Page } from "playwright";
import { builtBookTests, type CaseBrowser } from "./lib/browser.fixture";

/**
 * What a reader's browser does with text the book did not write: feedback
 * readers sent, an address that leads nowhere, and what localStorage holds.
 * Each shows as text, and nothing in it runs: no script error, no dialog,
 * and no element carrying an event handler. Against a static build of
 * on-call; run with `bun run test:browser`.
 */

const book = builtBookTests("on-call");
const it = book.it;

/** HTML that runs `alert(n)` when a page parses it. */
const xss = (n: number) => `<img src=x onerror="alert(${n})">`;

type Opened = {
	context: BrowserContext;
	page: Page;
	/** Script errors, and the message of each dialog a script opened. */
	ran: () => Promise<{ errors: string[]; dialogs: string[]; handlers: number }>;
};

/** A page in a new context that records whatever runs on it. */
const open = async (browser: CaseBrowser): Promise<Opened> => {
	const context = await browser.newContext();
	const page = await context.newPage();
	const errors: string[] = [];
	const dialogs: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	page.on("dialog", (dialog) => {
		dialogs.push(dialog.message());
		void dialog.dismiss();
	});
	return {
		context,
		page,
		ran: async () => {
			// An <img src=x> fails to load once the page asks for it.
			await page.waitForLoadState("networkidle");
			const handlers = await page.evaluate(
				() => document.querySelectorAll("[onerror], [onload]").length,
			);
			return { errors, dialogs, handlers };
		},
	};
};

const goto = (page: Page, path: string) =>
	page.goto(`${book.origin()}${path}`, { waitUntil: "networkidle" });

const nothingRan = { errors: [], dialogs: [], handlers: 0 };

describe("the feedback dashboard", () => {
	const rows = (page: Page) =>
		page.locator("[data-feedback-rows] tr").evaluateAll((trs) =>
			trs.map((tr) =>
				Array.from(tr.children, (cell) => ({
					text: cell.textContent,
					elements: cell.children.length,
				})),
			),
		);

	it("shows the slugs and emoji a server sends as text", async (browser) => {
		const { context, page, ran } = await open(browser);
		const timestamp = Date.now() - 60_000;
		// What the endpoint stored before it checked slugs and emoji.
		await page.route(
			(url) => url.pathname === "/api/feedback.json",
			(route) =>
				route.fulfill({
					json: {
						ok: true,
						events: [
							{ eventType: "impression", timestamp, slug: xss(1) },
							{
								eventType: "feedback",
								timestamp,
								slug: xss(1),
								title: xss(2),
								responseType: "emoji",
								emoji: xss(3),
								comment: "<script>alert(4)</script>",
							},
						],
					},
				}),
		);
		await goto(page, "/read/analytics");
		await page.waitForSelector("[data-feedback-rows] tr");
		expect(await rows(page)).toEqual([
			[
				{ text: xss(1), elements: 0 },
				{ text: "1", elements: 0 },
				{ text: "1", elements: 0 },
				{ text: "0%", elements: 0 },
				{ text: `${xss(3)} 1`, elements: 0 },
			],
		]);
		expect(
			await page.locator("[data-feedback-comment-list] li").textContent(),
		).toContain("<script>alert(4)</script>");
		expect(await ran()).toEqual(nothingRan);
		await context.close();
	});

	it("shows this browser's own stored events as text, skipping any with no slug", async (browser) => {
		const { context, page, ran } = await open(browser);
		const timestamp = Date.now() - 60_000;
		await context.addInitScript(
			([events]) => {
				localStorage.setItem("on-call.feedback.events", events);
			},
			[
				JSON.stringify([
					{ eventType: "impression", timestamp, slug: 5 },
					{ eventType: "feedback", timestamp, slug: xss(5) },
				]),
			],
		);
		await goto(page, "/read/analytics");
		await page.waitForSelector("[data-feedback-rows] tr");
		expect((await rows(page)).map((cells) => cells[0])).toEqual([
			{ text: xss(5), elements: 0 },
		]);
		expect(await ran()).toEqual(nothingRan);
		await context.close();
	});
});

describe("a page that is not there", () => {
	it("offers to search for the words of its address, as text", async (browser) => {
		const { context, page, ran } = await open(browser);
		const words = `${xss(1)}"><svg onload=alert(2)>`;
		await goto(page, `/read/toolkit/${encodeURIComponent(words)}`);
		const button = page.locator("[data-search-from-path]");
		await page.waitForFunction(() =>
			document
				.querySelector("[data-search-from-path]")
				?.textContent?.startsWith("Search for"),
		);
		const query = words.toLowerCase();
		expect(await button.textContent()).toBe(`Search for “${query}”`);
		expect(await button.locator("*").count()).toBe(0);

		await button.click();
		await page.waitForFunction(
			(expected) =>
				(document.querySelector("[data-search-input]") as HTMLInputElement)
					?.value === expected,
			query,
		);
		await page.waitForSelector("[data-search-status]:has-text('result')");
		expect(await ran()).toEqual(nothingRan);
		await context.close();
	});
});

describe("a saved place to resume reading", () => {
	const KEY = "on-call.reader.lastChapter";
	const resume = (page: Page) => page.locator("main [data-resume-reading]");

	/** The home page, with `saved` stored as the place to resume. */
	const homeWith = async (browser: CaseBrowser, saved: string) => {
		const opened = await open(browser);
		await opened.context.addInitScript(
			([key, value]) => {
				localStorage.setItem(key, value);
			},
			[KEY, saved],
		);
		await goto(opened.page, "/");
		return opened;
	};

	it("links to the chapter the page lists, whatever else was saved with its slug", async (browser) => {
		const { context, page, ran } = await homeWith(
			browser,
			JSON.stringify({
				slug: "rollback-first",
				href: "javascript:alert(1)",
				label: xss(2),
			}),
		);
		await expect(resume(page).isVisible()).resolves.toBe(true);
		const link = resume(page).locator("a");
		expect(await link.getAttribute("href")).toBe(
			"/read/chapters/rollback-first",
		);
		expect(await link.textContent()).toBe("Continue: Rollback first");
		expect(await ran()).toEqual(nothingRan);
		await context.close();
	});

	it("offers nothing for a slug that is no chapter, or for anything else saved", async (browser) => {
		for (const saved of [
			JSON.stringify({ slug: xss(3) }),
			JSON.stringify({ slug: ["rollback-first"] }),
			JSON.stringify("rollback-first"),
			"<img src=x onerror=alert(4)>",
		]) {
			const { context, page, ran } = await homeWith(browser, saved);
			expect(await resume(page).isHidden(), saved).toBe(true);
			expect(await ran(), saved).toEqual(nothingRan);
			await context.close();
		}
	});
});
