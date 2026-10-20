import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type Browser,
	type BrowserContext,
	chromium,
	type Page,
} from "playwright";
import { repoRoot } from "./_lib";
import { resolveDistFile } from "./lib/a11y";

/**
 * What a reader's browser does with the wayfinding the pages carry, against
 * a static build of on-call: a chapter opened on this device is offered as
 * "Continue" on the home page and hub until the reader clears it, and
 * nothing breaks when storage is blocked; the menu leaves out "Shortcuts" on
 * a touch-only device; and `[` / `]` step through the page's own sections,
 * not the sidebar or "Keep going". Run with `bun run test:browser`.
 */

const BOOK = "on-call";
const CHAPTER = "/read/chapters/rollback-first";
const CASE_TIMEOUT = 30_000;

let outDir: string;
let server: ReturnType<typeof Bun.serve>;
let browser: Browser;
let origin: string;

beforeAll(async () => {
	outDir = mkdtempSync(join(tmpdir(), "bookkit-wayfinding-"));
	const build = Bun.spawnSync(
		[process.execPath, "run", "build", "--outDir", outDir],
		{ cwd: join(repoRoot(), "apps", BOOK), stdout: "pipe", stderr: "pipe" },
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
				: new Response(Bun.file(join(outDir, "404.html")), { status: 404 });
		},
	});
	origin = `http://127.0.0.1:${server.port}`;
	browser = await chromium.launch();
}, 240_000);

afterAll(async () => {
	await browser?.close();
	server?.stop(true);
	rmSync(outDir, { recursive: true, force: true });
}, CASE_TIMEOUT);

/** A page in a new context, failing the case on any script error. */
const open = async (
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
	page.goto(`${origin}${path}`, { waitUntil: "networkidle" });

const resume = (page: Page) => page.locator("main [data-resume-reading]");

describe("continue reading", () => {
	it(
		"offers nothing on a first visit",
		async () => {
			const { context, page, errors } = await open();
			for (const path of ["/", "/read"]) {
				await goto(page, path);
				expect(await resume(page).isHidden(), path).toBe(true);
			}
			expect(errors).toEqual([]);
			await context.close();
		},
		CASE_TIMEOUT,
	);

	it(
		"offers the last chapter opened on the home page and hub, saved on this device, until cleared",
		async () => {
			const { context, page, errors } = await open();
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
		},
		CASE_TIMEOUT,
	);

	it(
		"breaks nothing when the browser blocks storage",
		async () => {
			const { context, page, errors } = await open({}, () => {
				Object.defineProperty(window, "localStorage", {
					get() {
						throw new DOMException(
							"The operation is insecure.",
							"SecurityError",
						);
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
		},
		CASE_TIMEOUT,
	);
});

describe("menu", () => {
	const shortcutsShown = async (
		options: Parameters<Browser["newContext"]>[0],
		toggle: string,
	) => {
		const { context, page } = await open(options);
		await goto(page, CHAPTER);
		await page.click(toggle);
		await page.waitForSelector("[data-site-nav-overflow]:not([hidden])");
		const shown = await page.locator("[data-kbd-toggle]").isVisible();
		await context.close();
		return shown;
	};

	it(
		"offers Shortcuts where there is a keyboard, not on a touch-only phone",
		async () => {
			expect(
				await shortcutsShown(
					{ viewport: { width: 1280, height: 800 } },
					"[data-site-nav-more-toggle]",
				),
			).toBe(true);
			expect(
				await shortcutsShown(
					{
						viewport: { width: 390, height: 844 },
						isMobile: true,
						hasTouch: true,
					},
					"[data-mobile-menu]",
				),
			).toBe(false);
		},
		CASE_TIMEOUT,
	);
});

describe("heading keys", () => {
	it(
		"step through the chapter's own sections, not the sidebar or Keep going",
		async () => {
			const { context, page, errors } = await open({
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
		},
		CASE_TIMEOUT,
	);
});
