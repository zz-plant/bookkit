import { join, relative } from "node:path";
import { createInterface } from "node:readline";
import { createGovernanceResourcesFromFiles } from "../packages/astro-bookkit/src/mcp/governance";
import {
	createJsonRpcError,
	handleRequest,
} from "../packages/astro-bookkit/src/mcp/jsonrpc-router";
import type {
	JsonRpcRequest,
	McpEndpointOptions,
} from "../packages/astro-bookkit/src/mcp/types";
import { listBookDirs, optionalArg, repoRoot } from "./_lib";
import { loadBookConfigSummary } from "./lib/authoring";
import { exitOnHelp, readFocusBook } from "./lib/cli";
import { loadRawModules } from "./lib/raw-modules";

/**
 * mcp — Bookkit's MCP tools over stdio, for agents working in this repo
 * (Claude Code, Codex, any MCP client). The same router serves the book
 * apps' HTTP endpoint; this needs no dev server.
 *
 * Every tool also takes `book` to work on another book in the workspace.
 * Registered in .mcp.json. One JSON-RPC message per line on stdin and
 * stdout; anything else goes to stderr. A long call (compile_book) does not
 * hold up the others: each answers when it is done.
 */

exitOnHelp({
	summary:
		"Serves Bookkit's MCP tools over stdio, for agents working in this\nworkspace: one JSON-RPC message per line on stdin and stdout. .mcp.json\nregisters it; it needs no dev server.",
	usage: ["bun run mcp [--book <book>]"],
	options: [
		[
			"--book <book>",
			"The book the content tools read (default: the current\none, set with bookkit use, else the first in apps/);\nevery tool also takes `book`",
		],
	],
	examples: ["bun run mcp", "bun run mcp -- --book on-call"],
});

const root = repoRoot();
const books = listBookDirs();
const book = optionalArg("--book") ?? readFocusBook(books) ?? books[0];

if (!book || !books.includes(book)) {
	process.stderr.write(
		`bookkit mcp: unknown book "${book ?? ""}". Available: ${books.join(", ")}\n`,
	);
	process.exit(1);
}

const config = await loadBookConfigSummary(book);
const options: McpEndpointOptions = {
	bookTitle: config.title,
	bookSlug: book,
	contentRawModules: loadRawModules(
		join(root, "apps", book, "src", "content", "book"),
	),
	governanceResources: createGovernanceResourcesFromFiles(root, undefined, {
		allowMissingFiles: true,
	}),
	workspaceRoot: root,
};

const send = (message: unknown) => {
	process.stdout.write(`${JSON.stringify(message)}\n`);
};

const isRequest = (value: unknown): value is JsonRpcRequest =>
	typeof value === "object" &&
	value !== null &&
	typeof (value as { method?: unknown }).method === "string";

const respond = async (request: unknown) => {
	if (!isRequest(request)) {
		return createJsonRpcError(
			null,
			-32600,
			"Invalid request: expected a JSON-RPC object with a method.",
		);
	}
	try {
		return await handleRequest(options, request);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		return request.id === undefined
			? null
			: createJsonRpcError(request.id, -32603, `Internal error: ${reason}`);
	}
};

const lines = createInterface({ input: process.stdin });
lines.on("line", (line) => {
	if (!line.trim()) return;
	let message: unknown;
	try {
		message = JSON.parse(line);
	} catch {
		send(createJsonRpcError(null, -32700, "Parse error: not valid JSON."));
		return;
	}
	if (Array.isArray(message)) {
		void Promise.all(message.map(respond)).then((all) => {
			const responses = all.filter(Boolean);
			if (responses.length > 0) send(responses);
		});
		return;
	}
	void respond(message).then((response) => {
		if (response) send(response);
	});
});

process.stderr.write(
	`bookkit mcp: serving ${relative(root, join(root, "apps", book))} over stdio\n`,
);
