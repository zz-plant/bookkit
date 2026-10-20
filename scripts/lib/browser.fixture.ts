import { mkdtempSync, rmSync } from "node:fs";
import { loadavg, tmpdir } from "node:os";
import { join } from "node:path";
import { type Browser, chromium } from "playwright";
import { repoRoot } from "../_lib";
import { resolveDistFile } from "./a11y";
import { BUILD_DEADLINE_MS, runChild } from "./child-process.fixture";

/**
 * For the browser tests (`bun run test:browser`): a static build of one of
 * the repo's books, served as a static host serves it, and Playwright's
 * Chromium to read it.
 *
 * Closing Chromium is where these tests failed on a loaded machine: at a
 * load average of 91, `browser.close()` outlasted the `afterAll` hook's 30 s
 * after every case had passed, and the run failed. So closing goes in
 * bounded steps and falls back to killing the browser. A slow close is
 * logged, never thrown: by then every case has run and reported.
 */

/** How long each step of closing may take: the contexts (and their pages), then the browser. */
export const CLOSE_STEP_MS = 10_000;

/** For `beforeAll`: the build's deadline, and time to start Chromium. */
export const OPEN_TIMEOUT_MS = BUILD_DEADLINE_MS + 60_000;

/** For `afterAll`: both steps of closing, the kill, and removing the build. */
export const CLOSE_TIMEOUT_MS = 4 * CLOSE_STEP_MS;

export type BuiltBook = {
	browser: Browser;
	/** Where the build is served: `http://127.0.0.1:<port>`. */
	origin: string;
	/** Closes Chromium, stops the server, and removes the build. Never throws. */
	close: () => Promise<void>;
};

/** This process's running children, by id; `ps` itself left out. */
const childPids = (): Set<number> => {
	try {
		const { stdout } = runChild(["ps", "-A", "-o", "pid=,ppid=,comm="]);
		return new Set(
			stdout.split("\n").flatMap((line) => {
				const [pid, ppid, command] = line.trim().split(/\s+/);
				return Number(ppid) === process.pid && !/(^|\/)ps$/.test(command)
					? [Number(pid)]
					: [];
			}),
		);
	} catch {
		// No `ps`: closing has no processes to fall back on killing.
		return new Set();
	}
};

/** True when `work` settles (either way) within `ms`, false when it does not. */
const settlesWithin = async (
	work: Promise<unknown>,
	ms: number,
): Promise<boolean> => {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const late = new Promise<boolean>((resolve) => {
		timer = setTimeout(() => resolve(false), ms);
	});
	try {
		return await Promise.race([
			work.then(
				() => true,
				() => true,
			),
			late,
		]);
	} finally {
		clearTimeout(timer);
	}
};

/** Kills each process and the group it leads (Playwright starts the browser in its own); the ids it killed. */
const kill = (pids: Iterable<number>): number[] =>
	[...pids].filter((pid) => {
		for (const target of [-pid, pid]) {
			try {
				process.kill(target, "SIGKILL");
				return true;
			} catch {
				// Not a group leader, or already gone.
			}
		}
		return false;
	});

/**
 * Closes `browser` in bounded steps: its contexts first, which closes their
 * pages, then the browser itself. When a step outlasts `stepMs`, the
 * browser's processes (`pids`) are killed and the slow close is logged.
 * Never throws.
 */
export const closeBrowser = async (
	browser: Pick<Browser, "contexts" | "close">,
	pids: Iterable<number>,
	{ stepMs = CLOSE_STEP_MS, log = console.warn } = {},
): Promise<void> => {
	let contexts: ReturnType<Browser["contexts"]> = [];
	try {
		contexts = browser.contexts();
	} catch {
		// Disconnected already: nothing of it to close.
	}
	const pagesClosed = await settlesWithin(
		Promise.all(contexts.map((context) => context.close())),
		stepMs,
	);
	if (pagesClosed && (await settlesWithin(browser.close(), stepMs))) return;
	const killed = kill(pids);
	log(
		`Chromium's ${pagesClosed ? "browser" : "pages"} did not close within ${stepMs / 1000} s (load average ${loadavg()[0].toFixed(0)}), so ${killed.length > 0 ? `its process was killed (${killed.join(", ")})` : "it was left to exit with this process"}. The cases had already run; this does not fail them.`,
	);
};

/**
 * Builds `book` (one of apps/) into a scratch folder, serves the build as a
 * static host serves a book (404.html for an address with no page), and
 * starts Chromium.
 */
export const openBuiltBook = async (book: string): Promise<BuiltBook> => {
	const outDir = mkdtempSync(join(tmpdir(), `bookkit-browser-${book}-`));
	let server: ReturnType<typeof Bun.serve> | undefined;
	try {
		const build = runChild(
			[process.execPath, "run", "build", "--outDir", outDir],
			{ cwd: join(repoRoot(), "apps", book), deadlineMs: BUILD_DEADLINE_MS },
		);
		if (build.status !== 0) {
			throw new Error(`Building ${book} failed:\n${build.output}`);
		}
		const served = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			fetch(request) {
				const file = resolveDistFile(outDir, new URL(request.url).pathname);
				return file
					? new Response(Bun.file(file))
					: new Response(Bun.file(join(outDir, "404.html")), { status: 404 });
			},
		});
		server = served;
		const before = childPids();
		const browser = await chromium.launch();
		const pids = [...childPids()].filter((pid) => !before.has(pid));
		return {
			browser,
			origin: `http://127.0.0.1:${served.port}`,
			close: async () => {
				await closeBrowser(browser, pids);
				served.stop(true);
				rmSync(outDir, { recursive: true, force: true });
			},
		};
	} catch (error) {
		server?.stop(true);
		rmSync(outDir, { recursive: true, force: true });
		throw error;
	}
};
