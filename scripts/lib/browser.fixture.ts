import { afterAll, beforeAll, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { loadavg, tmpdir } from "node:os";
import { join } from "node:path";
import { type Browser, chromium, errors } from "playwright";
import { repoRoot } from "../_lib";
import { resolveDistFile } from "./a11y";
import { copyBooks } from "./book-workspace.fixture";
import { BUILD_DEADLINE_MS, runChild } from "./child-process.fixture";

/**
 * For the browser tests (`bun run test:browser`): a build of one of the
 * repo's books (static, or with a server runtime's pages), served as a
 * static host serves it, and Playwright's Chromium to read it. A test file calls `builtBookTests(book)` and writes
 * its cases with the `it` that returns.
 *
 * On a loaded machine Chromium is slow, and the tests failed three ways:
 * - Closing it outlasted the `afterAll` hook's 30 s after every case had
 *   passed. So closing goes in bounded steps and falls back to killing the
 *   browser; a slow close is logged, never thrown.
 * - A case outlasted its fixed 30 s. When a case times out, Bun kills every
 *   process the test process started, Chromium among them, so the file's
 *   other cases failed too. So each case gets a budget scaled to how long
 *   Chromium took to load the book's first page, within Bun's own limit, and
 *   one that runs out of time, or loses its browser, runs once more in a new
 *   Chromium. A case that fails its assertions is not run again.
 * - After Chromium was killed that way, `bun test` did not exit. So once the
 *   last book is closed, a run still going `EXIT_GRACE_MS` later exits with
 *   code 1, saying why.
 */

/** How long each step of closing may take: the contexts (and their pages), then the browser. */
export const CLOSE_STEP_MS = 10_000;

/** Playwright's limit on starting Chromium, and on loading the first page in it. */
const LAUNCH_TIMEOUT_MS = 60_000;
const WARMUP_TIMEOUT_MS = 60_000;

const CASE_BUDGET_MIN_MS = 30_000;
const CASE_BUDGET_MAX_MS = 120_000;
const LOADS_PER_CASE = 10;

/**
 * A case's budget, given how long Chromium took to load the book's home
 * page: as many such loads as a case makes page loads and waits
 * (`LOADS_PER_CASE`), but no less than 30 s, which an idle machine never
 * needs, and no more than 2 minutes.
 */
export const caseBudgetMs = (loadMs: number): number =>
	Math.min(
		CASE_BUDGET_MAX_MS,
		Math.max(CASE_BUDGET_MIN_MS, Math.ceil(LOADS_PER_CASE * loadMs)),
	);

/** For `beforeAll`: the build's deadline, and two tries at starting Chromium. */
export const OPEN_TIMEOUT_MS =
	BUILD_DEADLINE_MS + 2 * (LAUNCH_TIMEOUT_MS + WARMUP_TIMEOUT_MS) + 20_000;

/** For `afterAll`: both steps of closing, the kill, and removing the build. */
export const CLOSE_TIMEOUT_MS = 4 * CLOSE_STEP_MS;

/**
 * Bun's limit for a case, which the fixture's own budget keeps it from
 * reaching: two runs at the largest budget, and closing one Chromium and
 * starting another between them.
 */
export const CASE_TIMEOUT_MS =
	2 * CASE_BUDGET_MAX_MS +
	2 * CLOSE_STEP_MS +
	LAUNCH_TIMEOUT_MS +
	WARMUP_TIMEOUT_MS +
	20_000;

/** How long a run may go on after the last browser test closes before it exits with code 1. */
export const EXIT_GRACE_MS = 30_000;

const load = () => `load average ${loadavg()[0].toFixed(0)}`;
const seconds = (ms: number) => `${Number((ms / 1000).toFixed(1))} s`;

/** Books open in this process, and whether a Chromium was lost while they were. */
let openBooks = 0;
let chromiumLost = false;
let exitTimer: ReturnType<typeof setTimeout> | undefined;

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
		`${pagesClosed ? "Chromium" : "Chromium's pages"} did not close within ${seconds(stepMs)} (${load()}), ${killed.length > 0 ? `so its process was killed (${killed.join(", ")})` : "and none of its processes was left to kill"}. Closing does not fail the file.`,
	);
};

/** What a case may do with Chromium: open contexts and pages. */
export type CaseBrowser = Pick<Browser, "newContext" | "newPage">;

/** A browser case's body; it closes what it opens. */
export type BrowserCase = (browser: CaseBrowser) => Promise<void>;

/** One Chromium, and the budget its first page load gave each case run in it. */
export type BrowserSession = {
	browser: CaseBrowser;
	budgetMs: number;
	/** Whether Chromium is gone: crashed, or killed by something else. */
	lost: () => boolean;
};

/** How one run of a case ended. */
export type CaseRun =
	| { ok: true }
	| { ok: false; error: unknown; again: boolean; why: string };

/**
 * Runs `body` once within the session's budget. A run that outlasts it,
 * times out in Playwright, or loses its browser may run again (`again`); a
 * failed assertion, or any other error, may not. A run left behind fails
 * later, when its browser closes, and that is not the case's result.
 */
export const runCaseOnce = async (
	session: BrowserSession,
	body: BrowserCase,
): Promise<CaseRun> => {
	const run = body(session.browser);
	run.catch(() => {});
	if (!(await settlesWithin(run, session.budgetMs))) {
		return {
			ok: false,
			error: null,
			again: true,
			why: `did not finish within its ${seconds(session.budgetMs)}`,
		};
	}
	try {
		await run;
		return { ok: true };
	} catch (error) {
		if (error instanceof errors.TimeoutError) {
			return {
				ok: false,
				error,
				again: true,
				why: `timed out waiting for the page (${error.message.split("\n")[0]})`,
			};
		}
		if (session.lost()) {
			return { ok: false, error, again: true, why: "lost its Chromium" };
		}
		return { ok: false, error, again: false, why: "failed" };
	}
};

/**
 * Runs a case, and once more in a new session (`restart`) when its first
 * run may run again (`runCaseOnce`). Throws the case's error, or says it
 * ran out of time twice, after starting the next case a new session.
 */
export const runCase = async (
	name: string,
	body: BrowserCase,
	session: () => BrowserSession,
	restart: () => Promise<void>,
	log: (line: string) => void = console.warn,
): Promise<void> => {
	const first = await runCaseOnce(session(), body);
	if (first.ok) return;
	if (!first.again) throw first.error;
	log(
		`"${name}" ${first.why} (${load()}), so it runs once more in a new Chromium.`,
	);
	await restart();
	const second = await runCaseOnce(session(), body);
	if (second.ok) return;
	if (!second.again) throw second.error;
	// The second run may still be going; the next case gets a Chromium of its own.
	await restart().catch(() => {});
	throw new Error(
		`"${name}" ${first.why}, then ${second.why} in a new Chromium (${load()}).`,
		{ cause: second.error ?? undefined },
	);
};

/** A case's view of Chromium: pages and contexts that wait at most `timeoutMs` for anything. */
const caseBrowser = (browser: Browser, timeoutMs: number): CaseBrowser => ({
	newContext: async (options) => {
		const context = await browser.newContext(options);
		context.setDefaultTimeout(timeoutMs);
		return context;
	},
	newPage: async (options) => {
		const page = await browser.newPage(options);
		page.setDefaultTimeout(timeoutMs);
		return page;
	},
});

type Chromium = BrowserSession & { close: () => Promise<void> };

/**
 * Starts Chromium and loads `origin`'s home page in it, timing the load,
 * which sets the budget of each case run in it. Tries `tries` times.
 */
const startChromium = async (
	origin: string,
	tries: number,
): Promise<Chromium> => {
	for (let attempt = 1; ; attempt += 1) {
		const before = childPids();
		let started: { browser: Browser; pids: number[] } | undefined;
		try {
			const browser = await chromium.launch({ timeout: LAUNCH_TIMEOUT_MS });
			started = {
				browser,
				pids: [...childPids()].filter((pid) => !before.has(pid)),
			};
			let closing = false;
			let lost = false;
			browser.on("disconnected", () => {
				lost = !closing;
				if (lost) chromiumLost = true;
			});
			const context = await browser.newContext();
			const page = await context.newPage();
			const loading = performance.now();
			await page.goto(`${origin}/`, {
				waitUntil: "networkidle",
				timeout: WARMUP_TIMEOUT_MS,
			});
			const loadMs = performance.now() - loading;
			await context.close();
			const budgetMs = caseBudgetMs(loadMs);
			if (budgetMs > CASE_BUDGET_MIN_MS) {
				console.warn(
					`Chromium took ${seconds(loadMs)} to load the home page (${load()}), so each case may take ${seconds(budgetMs)}.`,
				);
			}
			const { pids } = started;
			return {
				browser: caseBrowser(browser, budgetMs / 2),
				budgetMs,
				lost: () => lost || !browser.isConnected(),
				close: async () => {
					closing = true;
					await closeBrowser(browser, pids);
				},
			};
		} catch (error) {
			if (started) {
				await closeBrowser(started.browser, started.pids, { log: () => {} });
			}
			const why = `Chromium did not start and load ${origin}/ (${load()})`;
			if (attempt >= tries) {
				throw new Error(
					`${why}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
			console.warn(`${why}, so it starts once more.`);
		}
	}
};

/**
 * Exits with code 1, saying `why`, if the process is still running
 * `graceMs` from now. The timer does not itself keep the process running,
 * so a run that ends on its own ends as before.
 */
export const exitIfStillRunning = (graceMs: number, why: () => string) => {
	clearTimeout(exitTimer);
	exitTimer = setTimeout(() => {
		console.error(why());
		process.exit(1);
	}, graceMs);
	exitTimer.unref();
};

const stillRunning = () =>
	`bun test was still running ${EXIT_GRACE_MS / 1000} s after the last browser test closed its book${chromiumLost ? ", after a Chromium closed on its own during the run (as it does when Bun kills a timed-out case's processes)" : ""}. Something holds the process open, so it exits here with code 1 instead of running until CI's limit.`;

export type BuiltBook = {
	/** Where the build is served: `http://127.0.0.1:<port>`. */
	origin: string;
	/** Runs a case in this book's Chromium (see `runCase`). */
	run: (name: string, body: BrowserCase) => Promise<void>;
	/** Closes Chromium, stops the server, and removes the build. Never throws. */
	close: () => Promise<void>;
};

export type BuildOptions = {
	/**
	 * `"server"` builds the book as `site.runtime: "server"` would, so its
	 * pages carry what needs a request handler (the Ask panel, feedback,
	 * analytics), and serves those prerendered pages. The API routes are not
	 * served: a case answers them with `page.route`, or they 404.
	 */
	runtime?: "static" | "server";
};

/**
 * An adapter that lets Astro build on-demand routes and serves nothing: a
 * server build's pages are prerendered, and the browser tests read only
 * those.
 */
const STAND_IN_ADAPTER = `{
	name: "bookkit-browser-test",
	hooks: {
		"astro:config:done": ({ setAdapter }) =>
			setAdapter({
				name: "bookkit-browser-test",
				entrypointResolution: "auto",
				serverEntrypoint: new URL("./server-entry.mjs", import.meta.url),
				supportedAstroFeatures: {
					serverOutput: "stable",
					staticOutput: "stable",
					hybridOutput: "stable",
					sharpImageService: "stable",
				},
			}),
	},
}`;

/**
 * A copy of `book` in a scratch workspace with `site.runtime: "server"` and
 * the stand-in adapter; apps/ is left alone. The caller removes `workspace`.
 */
const serverRuntimeCopy = (
	book: string,
): { workspace: string; appDir: string } => {
	const { workspace, appDir } = copyBooks(`browser-server-${book}-`, [book]);
	const dir = appDir(book);
	const edit = (file: string, from: string, to: string) => {
		const path = join(dir, file);
		const text = readFileSync(path, "utf8");
		if (!text.includes(from)) {
			throw new Error(
				`apps/${book}/${file} has no "${from}" to give the server runtime.`,
			);
		}
		writeFileSync(path, text.replace(from, to));
	};
	edit("src/book.config.ts", "site: {", 'site: {\n\t\truntime: "server",');
	edit(
		"astro.config.mjs",
		"integrations: [",
		`adapter: ${STAND_IN_ADAPTER},\n\tintegrations: [`,
	);
	writeFileSync(
		join(dir, "server-entry.mjs"),
		'export default { fetch: () => new Response("Not served in browser tests.", { status: 501 }) };\n',
	);
	return { workspace, appDir: dir };
};

/**
 * Builds `book` (one of apps/) into a scratch folder, serves the build as a
 * static host serves a book (404.html for an address with no page), and
 * starts Chromium.
 */
export const openBuiltBook = async (
	book: string,
	{ runtime = "static" }: BuildOptions = {},
): Promise<BuiltBook> => {
	openBooks += 1;
	clearTimeout(exitTimer);
	const outDir = mkdtempSync(join(tmpdir(), `bookkit-browser-${book}-`));
	let server: ReturnType<typeof Bun.serve> | undefined;
	let workspace: string | undefined;
	const done = () => {
		server?.stop(true);
		rmSync(outDir, { recursive: true, force: true });
		if (workspace) rmSync(workspace, { recursive: true, force: true });
		openBooks -= 1;
		if (openBooks === 0) exitIfStillRunning(EXIT_GRACE_MS, stillRunning);
	};
	try {
		let appDir = join(repoRoot(), "apps", book);
		// A server build's prerender step imports the book's dependencies
		// from its output, so that output stays in the workspace copy, where
		// they resolve; a host serves what it puts under client/.
		let buildDir = outDir;
		let siteDir = outDir;
		if (runtime === "server") {
			const copy = serverRuntimeCopy(book);
			workspace = copy.workspace;
			appDir = copy.appDir;
			buildDir = join(appDir, "dist");
			siteDir = join(buildDir, "client");
		}
		const build = runChild(
			[process.execPath, "run", "build", "--outDir", buildDir],
			{ cwd: appDir, deadlineMs: BUILD_DEADLINE_MS },
		);
		if (build.status !== 0) {
			throw new Error(`Building ${book} failed:\n${build.output}`);
		}
		const served = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			fetch(request) {
				const file = resolveDistFile(siteDir, new URL(request.url).pathname);
				return file
					? new Response(Bun.file(file))
					: new Response(Bun.file(join(siteDir, "404.html")), {
							status: 404,
						});
			},
		});
		server = served;
		const origin = `http://127.0.0.1:${served.port}`;
		let current = await startChromium(origin, 2);
		return {
			origin,
			run: (name, body) =>
				runCase(
					name,
					body,
					() => current,
					async () => {
						await current.close();
						current = await startChromium(origin, 1);
					},
				),
			close: async () => {
				await current.close();
				done();
			},
		};
	} catch (error) {
		done();
		throw error;
	}
};

/**
 * For a browser test file: builds and serves `book` and starts Chromium
 * before its cases (`beforeAll`), closes them after (`afterAll`), and
 * returns the book's `origin` and the `it` its cases are written with,
 * which runs each through `runCase` within `CASE_TIMEOUT_MS`.
 */
export const builtBookTests = (book: string, options: BuildOptions = {}) => {
	let built: BuiltBook | undefined;
	beforeAll(async () => {
		built = await openBuiltBook(book, options);
	}, OPEN_TIMEOUT_MS);
	afterAll(() => built?.close(), CLOSE_TIMEOUT_MS);
	const opened = (): BuiltBook => {
		if (!built) {
			throw new Error(
				`${book} was not built, served, and opened in Chromium; the reason is under beforeAll.`,
			);
		}
		return built;
	};
	return {
		origin: () => opened().origin,
		it: (name: string, body: BrowserCase) =>
			it(name, () => opened().run(name, body), CASE_TIMEOUT_MS),
	};
};
