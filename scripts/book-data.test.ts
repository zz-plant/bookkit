import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import type { Subprocess } from "bun";
import { repoRoot } from "./_lib";
import { createBookWorkspace, runBun } from "./lib/book-workspace.fixture";

/**
 * Two books' dev servers running at once on one machine, as `bookkit dev`
 * runs them: what readers send each one is kept in that book's own folder
 * (`apps/<book>/.bookkit/`), and each book's dashboards read only its own
 * records. Both servers start in the workspace root, so the book's folder
 * decides, not the working directory. Before, every server on the machine
 * wrote to the same files in the OS temp folder.
 */

const BOOKS = ["data-one", "data-two"] as const;
type Book = (typeof BOOKS)[number];

const DATA_FILES = [
	"export-analytics.jsonl",
	"feedback-events.json",
	"preview-analytics.jsonl",
	"reader-analytics.jsonl",
	"release-analytics.jsonl",
];

const freePort = (): Promise<number> =>
	new Promise((resolve, reject) => {
		const server = createServer();
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			const port = typeof address === "object" && address ? address.port : 0;
			server.close(() => resolve(port));
		});
	});

let workspace: string;
const appDirs = {} as Record<Book, string>;
const urls = {} as Record<Book, string>;
const servers: Subprocess<"ignore", "pipe", "pipe">[] = [];

const startDevServer = async (book: Book) => {
	const port = await freePort();
	const env: Record<string, string | undefined> = {
		...process.env,
		NO_COLOR: "1",
		ASTRO_DISABLE_UPDATE_CHECK: "true",
	};
	// The test preload gives this file a data folder of its own; the servers
	// must use their default.
	delete env.BOOKKIT_DATA_DIR;
	const server = Bun.spawn(
		[
			Bun.which("node") ?? process.execPath,
			join(repoRoot(), "scripts", "lib", "astro-dev.mjs"),
			appDirs[book],
			String(port),
		],
		{ cwd: workspace, env, stdin: "ignore", stdout: "pipe", stderr: "pipe" },
	);
	servers.push(server);
	// Drained as it arrives, so the server never blocks on a full pipe.
	const output = Promise.all([
		new Response(server.stdout).text(),
		new Response(server.stderr).text(),
	]).then((parts) => parts.join(""));
	urls[book] = `http://localhost:${port}`;
	const deadline = Date.now() + 90_000;
	while (Date.now() < deadline && server.exitCode === null) {
		const ready = await fetch(`${urls[book]}/api/analytics.json`).then(
			(response) => response.ok,
			() => false,
		);
		if (ready) return;
		await Bun.sleep(250);
	}
	server.kill("SIGKILL");
	throw new Error(
		`The dev server for ${book} did not answer on port ${port}:\n${await output}`,
	);
};

beforeAll(async () => {
	({ workspace, appDir: appDirs["data-one"] } = createBookWorkspace(
		"book-data-",
		"data-one",
	));
	const scaffold = runBun(
		[
			join(repoRoot(), "scripts", "scaffold-book.ts"),
			"--book",
			"data-two",
			"--no-install",
		],
		workspace,
	);
	if (scaffold.exitCode !== 0) throw new Error(scaffold.output);
	appDirs["data-two"] = join(workspace, "apps", "data-two");
	await Promise.all(BOOKS.map(startDevServer));
}, 120_000);

afterAll(() => {
	for (const server of servers) server.kill("SIGKILL");
	if (workspace) rmSync(workspace, { recursive: true, force: true });
});

const post = (book: Book, route: string, body: unknown) =>
	fetch(`${urls[book]}/api/${route}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	}).then((response) => response.status);

const read = async <T>(book: Book, route: string): Promise<T> =>
	(await fetch(`${urls[book]}/api/${route}`)).json() as Promise<T>;

describe("two books' dev servers at once", () => {
	it("keep what each book's readers send in that book's folder, and show each book only its own", async () => {
		const sends = BOOKS.flatMap((book) => [
			...Array.from({ length: 5 }, (_, index) =>
				post(book, "analytics.json", {
					type: "pageview",
					path: `/read/${book}-${index}`,
					sessionId: book,
				}),
			),
			post(book, "preview-analytics.json", {
				type: "preview",
				tokenHint: book,
			}),
			post(book, "export-analytics.json", {
				type: "download",
				format: "pdf",
				slug: book,
			}),
			post(book, "release-analytics.json", {
				event: "rss_subscribe_click",
			}),
			post(book, "feedback.json", {
				eventType: "feedback",
				slug: `${book}-intro`,
			}),
		]);
		const statuses = await Promise.all(sends);
		expect(
			statuses.every((status) => status === 200),
			String(statuses),
		).toBe(true);

		for (const book of BOOKS) {
			const analytics = await read<{
				events: Array<{ path: string }>;
			}>(book, "analytics.json");
			expect(analytics.events.map((event) => event.path).sort()).toEqual(
				Array.from({ length: 5 }, (_, index) => `/read/${book}-${index}`),
			);

			const preview = await read<{ totals: Record<string, number> }>(
				book,
				"preview-analytics.json",
			);
			expect(preview.totals).toEqual({ [book]: 1 });

			const feedback = await read<{ events: Array<{ slug: string }> }>(
				book,
				"feedback.json",
			);
			expect(feedback.events.map((event) => event.slug)).toEqual([
				`${book}-intro`,
			]);

			expect(readdirSync(join(appDirs[book], ".bookkit")).sort()).toEqual(
				DATA_FILES,
			);
		}
		// Not in the folder the servers were started from.
		expect(existsSync(join(workspace, ".bookkit"))).toBe(false);
	}, 60_000);
});

describe("test files", () => {
	it("each keep reader data in a folder of their own, outside the repository", () => {
		// Set by scripts/lib/test-preload.ts, which bunfig.toml loads first.
		const dataDir = process.env.BOOKKIT_DATA_DIR ?? "";
		expect(dataDir).not.toBe("");
		expect(existsSync(dataDir)).toBe(true);
		expect(dataDir.startsWith(repoRoot())).toBe(false);
	});
});
