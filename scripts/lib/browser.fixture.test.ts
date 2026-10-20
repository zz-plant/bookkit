import { afterEach, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { errors } from "playwright";
import {
	type BrowserCase,
	type BrowserSession,
	caseBudgetMs,
	closeBrowser,
	runCase,
} from "./browser.fixture";
import { runChild } from "./child-process.fixture";

/**
 * The browser fixture without Chromium: a stand-in browser whose pages or
 * browser never finish closing, and a real process in place of Chromium's,
 * which a stalled close must kill; cases that pass, fail, hang, or lose
 * their browser; and a run that something holds open.
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
					`^Chromium did not close within 0.2 s \\(load average \\d+\\), so its process was killed \\(${child.pid}\\)\\. Closing does not fail the file\\.$`,
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

describe("caseBudgetMs", () => {
	it("gives a case ten first-page loads, from 30 s to 2 minutes", () => {
		expect(caseBudgetMs(400)).toBe(30_000);
		expect(caseBudgetMs(4_200)).toBe(42_000);
		expect(caseBudgetMs(30_000)).toBe(120_000);
	});
});

describe("runCase", () => {
	const session = (lost = false): BrowserSession => ({
		browser: {} as never,
		budgetMs: 100,
		lost: () => lost,
	});
	/** A case whose runs do, in turn, what `runs` say. */
	const cases = (...runs: Array<() => Promise<void>>) => {
		let count = 0;
		const body: BrowserCase = () => runs[count++]();
		return { body, count: () => count };
	};
	const run = async (
		body: BrowserCase,
		sessions: BrowserSession[] = [session(), session()],
	) => {
		const logged: string[] = [];
		let restarts = 0;
		let error: unknown;
		try {
			await runCase(
				"the case",
				body,
				() => sessions[restarts],
				async () => {
					restarts += 1;
				},
				(line) => logged.push(line),
			);
		} catch (thrown) {
			error = thrown;
		}
		return { logged, restarts, error };
	};

	it("runs a case that passes once, in the Chromium it has", async () => {
		const { body, count } = cases(done);
		expect(await run(body)).toEqual({
			logged: [],
			restarts: 0,
			error: undefined,
		});
		expect(count()).toBe(1);
	});

	it("does not run a case again when an assertion fails", async () => {
		const failed = new Error("expect(received).toBe(expected)");
		const { body, count } = cases(() => Promise.reject(failed), done);
		expect(await run(body)).toEqual({ logged: [], restarts: 0, error: failed });
		expect(count()).toBe(1);
	});

	it("runs a case once more in a new Chromium when it outlasts its budget", async () => {
		const { body, count } = cases(never, done);
		const { logged, restarts, error } = await run(body);
		expect(error).toBeUndefined();
		expect(restarts).toBe(1);
		expect(count()).toBe(2);
		expect(logged).toEqual([
			expect.stringMatching(
				/^"the case" did not finish within its 0\.1 s \(load average \d+\), so it runs once more in a new Chromium\.$/,
			),
		]);
	});

	it("runs a case once more after Playwright times out, or after its browser is lost", async () => {
		const timedOut = new errors.TimeoutError(
			"page.waitForSelector: Timeout 50ms exceeded.\nCall log: …",
		);
		const afterTimeout = await run(
			cases(() => Promise.reject(timedOut), done).body,
		);
		expect(afterTimeout.restarts).toBe(1);
		expect(afterTimeout.logged[0]).toStartWith(
			'"the case" timed out waiting for the page (page.waitForSelector: Timeout 50ms exceeded.) (load average',
		);

		const closed = new Error("Target page, context or browser has been closed");
		const afterLoss = await run(
			cases(() => Promise.reject(closed), done).body,
			[session(true), session()],
		);
		expect(afterLoss.restarts).toBe(1);
		expect(afterLoss.logged[0]).toStartWith('"the case" lost its Chromium');
		expect(afterLoss.error).toBeUndefined();
	});

	it("fails a case that runs out of time twice, saying so", async () => {
		const { error, restarts } = await run(cases(never, never).body, [
			session(),
			session(),
			session(),
		]);
		// A second session for the second run, and a third for the next case.
		expect(restarts).toBe(2);
		expect((error as Error).message).toMatch(
			/^"the case" did not finish within its 0\.1 s, then did not finish within its 0\.1 s in a new Chromium \(load average \d+\)\.$/,
		);
	});

	it("fails a case with its own error when its second run fails an assertion", async () => {
		const failed = new Error("expect(received).toEqual(expected)");
		const { error } = await run(
			cases(never, () => Promise.reject(failed)).body,
		);
		expect(error).toBe(failed);
	});
});

describe("exitIfStillRunning", () => {
	const fixture = join(import.meta.dir, "browser.fixture.ts");
	const child = (code: string) =>
		runChild([
			process.execPath,
			"-e",
			`const { exitIfStillRunning } = await import(${JSON.stringify(fixture)});\n${code}`,
		]);

	it("ends a run that something holds open, with code 1 and the reason", () => {
		const result = child(
			'exitIfStillRunning(200, () => "held open by a stand-in pipe");\nsetInterval(() => {}, 1_000);',
		);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("held open by a stand-in pipe");
	});

	it("does not keep a run going that ends on its own", () => {
		const started = performance.now();
		const result = child('exitIfStillRunning(30_000, () => "never shown");');
		expect(result.status).toBe(0);
		expect(result.stderr).not.toContain("never shown");
		expect(performance.now() - started).toBeLessThan(20_000);
	});
});
