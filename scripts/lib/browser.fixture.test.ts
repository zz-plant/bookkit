import { afterEach, describe, expect, it } from "bun:test";
import { closeBrowser } from "./browser.fixture";

/**
 * Closing the browser in teardown, without Chromium: a stand-in browser whose
 * pages or browser never finish closing, and a real process in place of
 * Chromium's, which a stalled close must kill.
 */

const never = () => new Promise<void>(() => {});
const done = () => Promise.resolve();

const children: Array<ReturnType<typeof Bun.spawn>> = [];
const stalledProcess = () => {
	const child = Bun.spawn(["sleep", "60"]);
	children.push(child);
	return child;
};

afterEach(() => {
	for (const child of children.splice(0)) child.kill("SIGKILL");
});

const fakeBrowser = (
	contextClose: () => Promise<void>,
	close: () => Promise<void>,
) => ({
	contexts: () => [{ close: contextClose }, { close: contextClose }] as never,
	close,
});

describe("closeBrowser", () => {
	it("closes the pages, then the browser, and kills nothing when both finish", async () => {
		const order: string[] = [];
		const child = stalledProcess();
		const logged: string[] = [];
		await closeBrowser(
			{
				contexts: () =>
					[{ close: async () => void order.push("context") }] as never,
				close: async () => void order.push("browser"),
			},
			[child.pid],
			{ stepMs: 1_000, log: (line) => logged.push(line) },
		);
		expect(order).toEqual(["context", "browser"]);
		expect(logged).toEqual([]);
		expect(child.exitCode).toBeNull();
	});

	it("kills the browser's process and logs, without throwing, when the browser does not close in time", async () => {
		const child = stalledProcess();
		const logged: string[] = [];
		await closeBrowser(fakeBrowser(done, never), [child.pid], {
			stepMs: 200,
			log: (line) => logged.push(line),
		});
		await child.exited;
		expect(child.signalCode).toBe("SIGKILL");
		expect(logged).toEqual([
			expect.stringMatching(
				new RegExp(
					`^Chromium's browser did not close within 0.2 s \\(load average \\d+\\), so its process was killed \\(${child.pid}\\)\\. The cases had already run; this does not fail them\\.$`,
				),
			),
		]);
	});

	it("does not wait for the browser when its pages do not close in time", async () => {
		const child = stalledProcess();
		const logged: string[] = [];
		let browserClosed = false;
		await closeBrowser(
			fakeBrowser(never, async () => {
				browserClosed = true;
			}),
			[child.pid],
			{ stepMs: 200, log: (line) => logged.push(line) },
		);
		expect(browserClosed).toBe(false);
		await child.exited;
		expect(child.signalCode).toBe("SIGKILL");
		expect(logged[0]).toStartWith(
			"Chromium's pages did not close within 0.2 s",
		);
	});

	it("counts a close that fails as finished, since the browser is gone", async () => {
		const logged: string[] = [];
		await closeBrowser(
			fakeBrowser(done, () => Promise.reject(new Error("Target closed"))),
			[],
			{ stepMs: 200, log: (line) => logged.push(line) },
		);
		expect(logged).toEqual([]);
	});
});
