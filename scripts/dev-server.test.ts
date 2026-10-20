import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createServer, type Server } from "node:net";
import { join } from "node:path";
import type { Subprocess } from "bun";
import { repoRoot } from "./_lib";
import { isPortInUse } from "./lib/dev-server";

/**
 * `bookkit dev` as a script or an agent runs it: no terminal on stdin, and an
 * AI agent detected from the environment, which makes `astro dev` move itself
 * to the background. The command must stay in the foreground, serve the MCP
 * endpoint's tool calls, and give the port back when it is stopped.
 */

// Not on-call: static-build.test.ts builds that app, and test files run in
// parallel, so two Astro processes would share its .astro/ folder.
const BOOK = "running-hot";
const AGENT_ENV = { ...process.env, CLAUDECODE: "1", NO_COLOR: "1" };

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

const bookkitDev = (port: number): Subprocess<"ignore", "pipe", "pipe"> =>
	Bun.spawn(
		[
			process.execPath,
			"run",
			join(repoRoot(), "scripts", "bookkit.ts"),
			"dev",
			BOOK,
			"--port",
			String(port),
		],
		{
			cwd: repoRoot(),
			env: AGENT_ENV,
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
		},
	);

const rpc = (url: string, body: string) =>
	fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body,
	});

describe("bookkit dev", () => {
	let port: number;
	let dev: Subprocess<"ignore", "pipe", "pipe">;
	let output: Promise<string>;
	let mcpUrl: string;

	beforeAll(async () => {
		port = await freePort();
		mcpUrl = `http://localhost:${port}/api/mcp.json`;
		dev = bookkitDev(port);
		// Drained as it arrives, so the server never blocks on a full pipe.
		output = Promise.all([
			new Response(dev.stdout).text(),
			new Response(dev.stderr).text(),
		]).then((parts) => parts.join(""));
		const deadline = Date.now() + 60_000;
		while (Date.now() < deadline && dev.exitCode === null) {
			if (
				await fetch(mcpUrl).then(
					(r) => r.ok,
					() => false,
				)
			)
				return;
			await Bun.sleep(250);
		}
		dev.kill("SIGKILL");
		throw new Error(
			`The dev server did not answer on port ${port}${dev.exitCode === null ? "" : ` (bookkit exited with ${dev.exitCode})`}:\n${await output}`,
		);
	}, 70_000);

	afterAll(() => {
		dev?.kill("SIGKILL");
	});

	it("stays in the foreground while the server runs", () => {
		expect(dev.exitCode).toBeNull();
	});

	it("serves the MCP discovery manifest and says it answers tool calls", async () => {
		const response = await fetch(mcpUrl);
		const body = (await response.json()) as {
			ok: boolean;
			toolCalls: { served: boolean };
		};

		expect(response.status).toBe(200);
		expect(body.ok).toBe(true);
		expect(body.toolCalls.served).toBe(true);
	});

	it("answers MCP tool calls over HTTP", async () => {
		const list = await rpc(
			mcpUrl,
			JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
		);
		const tools = (await list.json()) as {
			result: { tools: Array<{ name: string }> };
		};
		expect(tools.result.tools.map((tool) => tool.name)).toContain(
			"bookkit.validate_book",
		);

		const call = await rpc(
			mcpUrl,
			JSON.stringify({
				jsonrpc: "2.0",
				id: 2,
				method: "tools/call",
				params: { name: "bookkit.list_books", arguments: {} },
			}),
		);
		const result = (await call.json()) as {
			result?: { content: Array<{ text: string }> };
		};
		expect(result.result?.content[0]?.text).toContain(BOOK);
	});

	it("explains a malformed body as a JSON-RPC parse error", async () => {
		const response = await rpc(mcpUrl, "{not json");
		const body = (await response.json()) as {
			error: { code: number; message: string };
		};

		expect(response.status).toBe(400);
		expect(body.error.code).toBe(-32700);
		expect(body.error.message).toContain("not valid JSON");
	});

	it("dev status and dev stop, from another command, find it and stop it with SIGTERM", async () => {
		const control = (action: string) =>
			Bun.spawnSync(
				[
					process.execPath,
					"run",
					join(repoRoot(), "scripts", "bookkit.ts"),
					"dev",
					action,
					BOOK,
				],
				{ cwd: repoRoot(), env: AGENT_ENV, stdout: "pipe", stderr: "pipe" },
			).stdout.toString();
		expect(control("status")).toContain(
			`The dev server for ${BOOK} is running: http://localhost:${port}/`,
		);
		expect(control("stop")).toContain(
			`Stopped the dev server for ${BOOK} on port ${port}.`,
		);
		const code = await Promise.race([
			dev.exited,
			Bun.sleep(15_000).then(() => "still running"),
		]);

		// 128 + 15: how a shell reports a process ended by SIGTERM.
		expect(code).toBe(143);
		expect(await isPortInUse(port)).toBe(false);
		expect(await output).toContain(`localhost:${port}`);
	}, 20_000);
});

describe("bookkit dev on a port that is taken", () => {
	let blocker: Server;
	let port: number;

	beforeAll(async () => {
		port = await freePort();
		blocker = createServer();
		await new Promise<void>((resolve) =>
			blocker.listen(port, "127.0.0.1", resolve),
		);
	});

	afterAll(() => {
		blocker?.close();
	});

	it("says the port is in use and how to pick another, without starting", async () => {
		const run = bookkitDev(port);
		const code = await Promise.race([
			run.exited,
			Bun.sleep(20_000).then(() => {
				run.kill("SIGKILL");
				return "still running";
			}),
		]);
		const stderr = await new Response(run.stderr).text();

		expect(code).toBe(1);
		expect(stderr).toContain(`Port ${port} is already in use`);
		expect(stderr).toContain(`bun run bookkit dev ${BOOK} --port ${port + 1}`);
	}, 25_000);
});
