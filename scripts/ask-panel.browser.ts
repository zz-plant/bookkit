import { describe, expect } from "bun:test";
import axe from "axe-core";
import type { BrowserContext, Page } from "playwright";
import { QA_MODEL_DOWNLOAD } from "../packages/astro-bookkit/src/layouts/book-layout/qa-model-consent";
import {
	AXE_TAGS,
	type AxeViolation,
	type Finding,
	formatFindings,
	isFailing,
	VARIANTS,
	type Variant,
} from "./lib/a11y";
import { builtBookTests, type CaseBrowser } from "./lib/browser.fixture";

/**
 * The Ask panel, on a book with a server runtime (on-call, built as
 * `site.runtime: "server"` would build it). It asks before the reader's
 * browser downloads the models that rank passages, remembers the answer,
 * loads the models' runtime from the book's own site, and links a cited
 * passage only to a page of this book. Nothing outside the local server is
 * fetched: every such request is recorded and refused.
 * Run with `bun run test:browser`.
 */

const book = builtBookTests("on-call", { runtime: "server" });
const it = book.it;

/** localStorage keys, prefixed with the book's analytics key. */
const MODELS_KEY = "on-call.qa.models";
/** Words the book's passages hold: matching is by every word of the question. */
const QUESTION = "rollback";

type Opened = {
	context: BrowserContext;
	page: Page;
	/** Every request this context made to a host other than the book's. */
	elsewhere: string[];
};

/** A context that records and refuses every request that leaves the book's server. */
const open = async (
	browser: CaseBrowser,
	variant: Variant = VARIANTS[0],
): Promise<Opened> => {
	const context = await browser.newContext({
		colorScheme: variant.colorScheme,
		viewport: variant.viewport,
		isMobile: variant.mobile,
		hasTouch: variant.mobile,
		reducedMotion: "reduce",
	});
	const elsewhere: string[] = [];
	const origin = book.origin();
	await context.route(
		(url) => url.origin !== origin,
		(route) => {
			elsewhere.push(route.request().url());
			return route.abort();
		},
	);
	return { context, page: await context.newPage(), elsewhere };
};

/** Loads the home page and opens Ask from the menu, as a reader would. */
const openAsk = async (page: Page, variant: Variant = VARIANTS[0]) => {
	await page.goto(`${book.origin()}/`, { waitUntil: "networkidle" });
	await page.click(
		variant.mobile ? "[data-mobile-menu]" : "[data-site-nav-more-toggle]",
	);
	await page.click("[data-qa-toggle]");
	await page.waitForFunction(() =>
		document.activeElement?.matches("[data-qa-input]"),
	);
};

const ask = async (page: Page, question = QUESTION) => {
	await page.fill("[data-qa-input]", question);
	await page.click(".qa-panel__form [type=submit]");
};

const consent = (page: Page) => page.locator("[data-qa-consent]");
const answered = (page: Page) =>
	page.waitForSelector("[data-qa-citations] li", { state: "attached" });

const modelRequests = (elsewhere: string[]) =>
	elsewhere.filter((url) => new URL(url).host === QA_MODEL_DOWNLOAD.modelHost);

describe("the Ask panel's models", () => {
	it("asks before it downloads anything, saying what, how much, and from where", async (browser) => {
		const { context, page, elsewhere } = await open(browser);
		await openAsk(page);
		expect(await consent(page).isHidden()).toBe(true);
		await ask(page);

		await consent(page).waitFor({ state: "visible" });
		const text = (await consent(page).innerText()).replace(/\s+/g, " ");
		for (const words of [
			...QA_MODEL_DOWNLOAD.models,
			`about ${QA_MODEL_DOWNLOAD.modelMegabytes} MB from Hugging Face (huggingface.co)`,
			`${QA_MODEL_DOWNLOAD.runtimeMegabytes} MB runtime from this site`,
			"Your browser keeps them",
			"Not now: Ask still answers",
		]) {
			expect(text).toContain(words);
		}
		// Focus moves to the question, which a screen reader reads by its
		// heading and text; the status says the question waits.
		expect(
			await page.evaluate(() =>
				document.activeElement?.matches("[data-qa-consent]"),
			),
		).toBe(true);
		expect(await consent(page).getAttribute("role")).toBe("group");
		expect(await page.locator("[data-qa-status]").innerText()).toContain(
			"your question runs once you do",
		);
		expect(await page.locator("[data-qa-citations] li").count()).toBe(0);
		expect(elsewhere).toEqual([]);

		await page.click("[data-qa-consent-download]");
		await answered(page);
		expect(await consent(page).isHidden()).toBe(true);
		const fetched = modelRequests(elsewhere);
		expect(
			fetched.some((url) =>
				url.startsWith(
					`https://huggingface.co/${QA_MODEL_DOWNLOAD.models[0]}/`,
				),
			),
			elsewhere.join("\n"),
		).toBe(true);
		expect(
			await page.evaluate((key) => localStorage.getItem(key), MODELS_KEY),
		).toBe("download");

		// Remembered: the next visit asks nothing and goes straight to the
		// download (refused here, so it is tried again).
		const before = elsewhere.length;
		await openAsk(page);
		await ask(page);
		await answered(page);
		expect(await consent(page).isHidden()).toBe(true);
		expect(modelRequests(elsewhere.slice(before)).length).toBeGreaterThan(0);
		await context.close();
	});

	it("answers without them after Not now, remembers it, and asks again only when the reader wants", async (browser) => {
		const { context, page, elsewhere } = await open(browser);
		await openAsk(page);
		await ask(page);
		await consent(page).waitFor({ state: "visible" });
		await page.click("[data-qa-consent-decline]");

		// The question runs on the words alone: passages are cited.
		await answered(page);
		expect(
			await page.locator("[data-qa-citations] li").count(),
		).toBeGreaterThan(0);
		expect(await consent(page).isHidden()).toBe(true);
		const note = page.locator("[data-qa-models-off]");
		expect(await note.isVisible()).toBe(true);
		expect(
			await page.evaluate(() =>
				document.activeElement?.matches("[data-qa-input]"),
			),
		).toBe(true);
		expect(
			await page.evaluate((key) => localStorage.getItem(key), MODELS_KEY),
		).toBe("declined");

		// The next visit does not ask, and still fetches nothing.
		await openAsk(page);
		await ask(page, "owner");
		await answered(page);
		expect(await consent(page).isHidden()).toBe(true);
		expect(await note.isVisible()).toBe(true);

		// The note under the form asks again.
		await page.click("[data-qa-models-ask]");
		await consent(page).waitFor({ state: "visible" });
		expect(await note.isHidden()).toBe(true);
		await page.click("[data-qa-consent-decline]");
		expect(await consent(page).isHidden()).toBe(true);
		expect(elsewhere).toEqual([]);
		await context.close();
	});

	it("loads the models' runtime from this site after Download, not from jsDelivr", async (browser) => {
		const { context, page, elsewhere } = await open(browser);
		await context.addInitScript((key) => {
			localStorage.setItem(key, "download");
		}, MODELS_KEY);
		// Stand-ins for the Hub: a model's config, and bytes that are not a
		// model. ONNX Runtime fetches its WebAssembly before it reads them;
		// every other request to the Hub is refused, as before.
		await context.route(
			(url) => url.host === QA_MODEL_DOWNLOAD.modelHost,
			(route) => {
				const { pathname } = new URL(route.request().url());
				const headers = { "access-control-allow-origin": "*" };
				if (pathname.endsWith("/config.json")) {
					return route.fulfill({ json: { model_type: "bert" }, headers });
				}
				if (pathname.endsWith(".onnx")) {
					return route.fulfill({ body: "not a model", headers });
				}
				return route.fallback();
			},
		);
		const runtime = page.waitForRequest((request) =>
			new URL(request.url()).pathname.endsWith(".wasm"),
		);
		await openAsk(page);
		await ask(page);
		const fetched = new URL((await runtime).url());
		expect(fetched.origin).toBe(book.origin());
		expect(fetched.pathname).toMatch(
			/^\/_astro\/ort-wasm(-simd)?\.[\w-]+\.wasm$/,
		);
		// The models cannot load here, so the passages are matched by their words.
		await answered(page);
		expect(
			elsewhere.filter(
				(url) => new URL(url).host !== QA_MODEL_DOWNLOAD.modelHost,
			),
		).toEqual([]);
		await context.close();
	});

	it("keeps Turn off, which hides the question with the rest of the panel", async (browser) => {
		const { context, page, elsewhere } = await open(browser);
		await openAsk(page);
		await ask(page);
		await consent(page).waitFor({ state: "visible" });
		await page.click("[data-qa-disable]");
		expect(await page.locator("[data-qa-disabled]").isVisible()).toBe(true);
		expect(await consent(page).isVisible()).toBe(false);
		await page.click("[data-qa-enable]");
		expect(await consent(page).isVisible()).toBe(true);
		expect(elsewhere).toEqual([]);
		await context.close();
	});

	it("passes axe with the question open, light and dark, desktop and phone", async (browser) => {
		const findings: Finding[] = [];
		for (const variant of VARIANTS) {
			const { context, page, elsewhere } = await open(browser, variant);
			await openAsk(page, variant);
			await ask(page);
			await consent(page).waitFor({ state: "visible" });
			await page.evaluate(() => document.fonts.ready.then(() => {}));
			await page.addScriptTag({ content: axe.source });
			const violations = (await page.evaluate(
				(tags) =>
					(window as unknown as { axe: typeof axe }).axe
						.run(document, { runOnly: { type: "tag", values: tags } })
						.then((results) => results.violations),
				AXE_TAGS,
			)) as AxeViolation[];
			for (const violation of violations.filter(isFailing)) {
				findings.push({
					book: "on-call",
					page: "/ (Ask, model question)",
					variant: variant.label,
					violation,
				});
			}
			expect(elsewhere).toEqual([]);
			await context.close();
		}
		expect(formatFindings(findings)).toEqual([]);
	});
});

describe("Ask's citations", () => {
	it("link only to pages of this book; any other address keeps its title as text", async (browser) => {
		const { context, page, elsewhere } = await open(browser);
		await context.addInitScript((key) => {
			localStorage.setItem(key, "declined");
		}, MODELS_KEY);
		// What a model could write into the server's answer.
		const citations = [
			{
				id: "a",
				title: "Own the incident",
				url: "/read/chapters/overview#owner",
			},
			{ id: "b", title: "Elsewhere", url: "https://evil.example/read" },
			{ id: "c", title: "Protocol-relative", url: "//evil.example/read" },
			{ id: "d", title: "Backslash", url: "/\\evil.example/read" },
			{ id: "e", title: "Script", url: "javascript:alert(1)" },
			{ id: "f", title: "Relative", url: "read/chapters/overview" },
		];
		await page.route(
			(url) => url.pathname === "/api/qa.json",
			(route) =>
				route.fulfill({ json: { answer: "Name one owner.", citations } }),
		);
		await openAsk(page);
		await ask(page);
		await answered(page);
		const cited = await page
			.locator("[data-qa-citations] li > :first-child")
			.evaluateAll((nodes) =>
				nodes.map((node) => ({
					tag: node.tagName.toLowerCase(),
					href: node.getAttribute("href"),
					text: node.textContent,
				})),
			);
		expect(cited).toEqual([
			{
				tag: "a",
				href: "/read/chapters/overview#owner",
				text: "Own the incident",
			},
			...citations.slice(1).map(({ title }) => ({
				tag: "span",
				href: null,
				text: title,
			})),
		]);
		expect(elsewhere).toEqual([]);
		await context.close();
	});
});
