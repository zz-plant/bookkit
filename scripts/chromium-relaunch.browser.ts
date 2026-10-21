import { describe, expect, it } from "bun:test";
import { closeBrowser, launchChromium } from "./lib/browser.fixture";

/**
 * The browser fixture starts a Chromium for each test file, after the last
 * one closed. Bun closes a finished child's pipes a second time when the
 * garbage collector frees it, which cut the next Chromium off in CI (see
 * `launchChromium`). Run with `bun run test:browser`.
 */

const ANSWER_MS = 10_000;

describe("a Chromium started after another closed", () => {
	it("still answers after a garbage collection", async () => {
		const first = await launchChromium();
		await first.close();
		const second = await launchChromium();
		try {
			for (let i = 0; i < 3; i++) {
				Bun.gc(true);
				await Bun.sleep(50);
			}
			const page = async () => {
				const context = await second.newContext();
				const opened = await context.newPage();
				await opened.setContent("<p>still here</p>");
				const text = await opened.textContent("p");
				await context.close();
				return text;
			};
			const answer = await Promise.race([
				page(),
				Bun.sleep(ANSWER_MS).then(() => `no answer in ${ANSWER_MS / 1000} s`),
			]);
			expect(answer).toBe("still here");
		} finally {
			await closeBrowser(second, [], { log: () => {} });
		}
	}, 60_000);
});
