import { describe, expect } from "bun:test";
import type { Browser, BrowserContext, Page } from "playwright";
import { builtBookTests, type CaseBrowser } from "./lib/browser.fixture";

/**
 * What a reader's browser does with the wayfinding the pages carry, against
 * a static build of on-call: a chapter opened on this device is offered as
 * "Continue" on the home page and hub until the reader clears it, and
 * nothing breaks when storage is blocked; the menu leaves out "Shortcuts" on
 * a touch-only device; and `[` / `]` step through the page's own sections,
 * not the sidebar or "Keep going". Run with `bun run test:browser`.
 */

const CHAPTER = "/read/chapters/rollback-first";

const book = builtBookTests("on-call");
const it = book.it;

/** A page in a new context, failing the case on any script error. */
const open = async (
	browser: CaseBrowser,
	options: Parameters<Browser["newContext"]>[0] = {},
	init?: () => void,
): Promise<{ context: BrowserContext; page: Page; errors: string[] }> => {
	const context = await browser.newContext(options);
	if (init) await context.addInitScript(init);
	const page = await context.newPage();
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	return { context, page, errors };
};

const goto = (page: Page, path: string) =>
	page.goto(`${book.origin()}${path}`, { waitUntil: "networkidle" });

const resume = (page: Page) => page.locator("main [data-resume-reading]");

describe("continue reading", () => {
	it("offers nothing on a first visit", async (browser) => {
		const { context, page, errors } = await open(browser);
		for (const path of ["/", "/read"]) {
			await goto(page, path);
			expect(await resume(page).isHidden(), path).toBe(true);
		}
		expect(errors).toEqual([]);
		await context.close();
	});

	it("offers the last chapter opened on the home page and hub, saved on this device, until cleared", async (browser) => {
		const { context, page, errors } = await open(browser);
		await goto(page, "/read/chapters/overview");
		await goto(page, CHAPTER);
		for (const path of ["/", "/read"]) {
			await goto(page, path);
			await expect(resume(page).isVisible()).resolves.toBe(true);
			const link = resume(page).locator("a");
			expect(await link.textContent()).toBe("Continue: Rollback first");
			expect(await link.getAttribute("href")).toBe(CHAPTER);
			expect(await resume(page).textContent()).toContain(
				"Saved on this device.",
			);
		}
		await resume(page).getByRole("button", { name: "Clear" }).click();
		expect(await resume(page).isHidden()).toBe(true);
		await goto(page, "/");
		expect(await resume(page).isHidden()).toBe(true);
		// Reference pages are not chapters: they are not remembered.
		await goto(page, "/read/toolkit/classify-alert-severity");
		await goto(page, "/");
		expect(await resume(page).isHidden()).toBe(true);
		expect(errors).toEqual([]);
		await context.close();
	});

	it("breaks nothing when the browser blocks storage", async (browser) => {
		const { context, page, errors } = await open(browser, {}, () => {
			Object.defineProperty(window, "localStorage", {
				get() {
					throw new DOMException("The operation is insecure.", "SecurityError");
				},
			});
		});
		await goto(page, CHAPTER);
		await goto(page, "/");
		expect(await resume(page).isHidden()).toBe(true);
		// The rest of the page script still runs: search opens.
		await page.click("[data-search-toggle]");
		await page.waitForFunction(() =>
			document.activeElement?.matches("[data-search-input]"),
		);
		expect(errors).toEqual([]);
		await context.close();
	});
});

describe("menu", () => {
	const shortcutsShown = async (
		browser: CaseBrowser,
		options: Parameters<Browser["newContext"]>[0],
		toggle: string,
	) => {
		const { context, page } = await open(browser, options);
		await goto(page, CHAPTER);
		await page.click(toggle);
		await page.waitForSelector("[data-site-nav-overflow]:not([hidden])");
		const shown = await page.locator("[data-kbd-toggle]").isVisible();
		await context.close();
		return shown;
	};

	it("offers Shortcuts where there is a keyboard, not on a touch-only phone", async (browser) => {
		expect(
			await shortcutsShown(
				browser,
				{ viewport: { width: 1280, height: 800 } },
				"[data-site-nav-more-toggle]",
			),
		).toBe(true);
		expect(
			await shortcutsShown(
				browser,
				{
					viewport: { width: 390, height: 844 },
					isMobile: true,
					hasTouch: true,
				},
				"[data-mobile-menu]",
			),
		).toBe(false);
	});
});

describe("heading keys", () => {
	it("step through the chapter's own sections, not the sidebar or Keep going", async (browser) => {
		const { context, page, errors } = await open(browser, {
			viewport: { width: 1280, height: 800 },
			reducedMotion: "reduce",
		});
		await goto(page, CHAPTER);
		const sections = await page
			.locator("main article :is(h2, h3)")
			.allTextContents();
		expect(sections.length).toBeGreaterThan(1);
		const visited: string[] = [];
		for (let press = 0; press < sections.length + 3; press += 1) {
			await page.keyboard.press("]");
			visited.push(
				await page.evaluate(() => {
					const active = document.activeElement;
					return active?.matches("h2, h3")
						? (active.firstChild?.textContent ?? "").trim()
						: "";
				}),
			);
		}
		// The last presses stay on the last section.
		expect([...new Set(visited.filter(Boolean))]).toEqual(
			sections.slice(1).map((text) => text.replace(/#$/, "").trim()),
		);
		await page.keyboard.press("[");
		expect(
			await page.evaluate(() =>
				(document.activeElement?.firstChild?.textContent ?? "").trim(),
			),
		).toBe((sections.at(-2) ?? "").replace(/#$/, "").trim());
		expect(errors).toEqual([]);
		await context.close();
	});
});
