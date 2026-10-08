import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { repoRoot } from "./_lib";

/** Sends JSON-RPC lines to a fresh server and returns its responses by id. */
const exchange = async (messages: unknown[]) => {
	const server = Bun.spawn(
		[process.execPath, "run", join(repoRoot(), "scripts", "mcp-server.ts")],
		{ cwd: repoRoot(), stdin: "pipe", stdout: "pipe", stderr: "pipe" },
	);
	for (const message of messages) {
		// Strings are sent as raw lines, to exercise malformed input.
		server.stdin.write(
			`${typeof message === "string" ? message : JSON.stringify(message)}\n`,
		);
	}
	server.stdin.end();
	const output = await new Response(server.stdout).text();
	await server.exited;
	return new Map(
		output
			.trim()
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line))
			.map((response) => [response.id, response]),
	);
};

describe("mcp-server (stdio)", () => {
	it("speaks MCP: initialize, tools, and text tool results", async () => {
		const responses = await exchange([
			{
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: { protocolVersion: "2024-11-05", capabilities: {} },
			},
			{ jsonrpc: "2.0", method: "notifications/initialized" },
			{ jsonrpc: "2.0", id: 2, method: "tools/list" },
			{
				jsonrpc: "2.0",
				id: 3,
				method: "tools/call",
				params: { name: "bookkit.list_mechanisms", arguments: {} },
			},
			{ jsonrpc: "2.0", id: 4, method: "ping" },
		]);

		expect(responses.size).toBe(4);
		expect(responses.get(1).result.serverInfo.name).toBe("bookkit-mcp");
		const tools = responses
			.get(2)
			.result.tools.map((tool: { name: string }) => tool.name);
		expect(tools).toContain("bookkit.find_similar_mechanisms");
		expect(tools).toContain("bookkit.check_corpus");
		const call = responses.get(3).result;
		expect(call.content[0].type).toBe("text");
		expect(call.structuredContent.ok).toBe(true);
		expect(responses.get(4).result).toEqual({});
	});

	it("answers malformed lines with errors instead of exiting", async () => {
		const parseError = await exchange([
			"not json",
			{ jsonrpc: "2.0", id: 9, method: "ping" },
		]);
		expect(parseError.get(null).error.code).toBe(-32700);
		expect(parseError.get(9).result).toEqual({});

		const invalid = await exchange(['"just a string"']);
		expect(invalid.get(null).error.code).toBe(-32600);
	});

	it("compiles a candidate file without writing it, against the served book", async () => {
		const draft = (mechanism: string) =>
			`---\nslug: probe\nmechanism: ${mechanism}\nname: "Probe"\ntrigger: "t"\ntimeboxMinutes: 5\nsteps:\n  - "s"\nfailureLooksLike:\n  - "f"\nlegitimateDemand:\n  - "d"\n---\n`;
		const responses = await exchange([
			{
				jsonrpc: "2.0",
				id: 1,
				method: "tools/call",
				params: {
					name: "bookkit.get_content_contract",
					arguments: { section: "tool" },
				},
			},
			{
				jsonrpc: "2.0",
				id: 2,
				method: "tools/call",
				params: {
					name: "bookkit.check_content",
					arguments: { section: "tool", source: draft("no-such-mechanism") },
				},
			},
		]);
		const contract =
			responses.get(1).result.structuredContent.payload.contracts[0];
		expect(contract.directory).toBe("toolkit");
		const mechanismSlug = responses.get(2).result.structuredContent.payload
			.mechanismSlugs[0] as string;
		const failed = responses.get(2).result;
		expect(failed.isError).toBe(true);
		expect(failed.structuredContent.payload.findings[0]).toMatchObject({
			code: "UNKNOWN_MECHANISM",
			field: "mechanism",
		});

		const fixed = await exchange([
			{
				jsonrpc: "2.0",
				id: 3,
				method: "tools/call",
				params: {
					name: "bookkit.check_content",
					arguments: { section: "tool", source: draft(mechanismSlug) },
				},
			},
		]);
		expect(fixed.get(3).result.structuredContent.payload.findings).toEqual([]);
	});
});
