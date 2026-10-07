import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { createInterface } from "node:readline";
import type { BookContentRawModules } from "../packages/astro-bookkit/src/book/entrypoints";
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

/**
 * mcp — Bookkit's MCP tools over stdio, for agents working in this repo
 * (Claude Code, Codex, any MCP client). The same router serves the book
 * apps' HTTP endpoint; this needs no dev server.
 *
 *   bun run mcp                    # content tools read the first book
 *   bun run mcp -- --book on-call  # ...or a chosen one
 *
 * Registered in .mcp.json. One JSON-RPC message per line on stdin and
 * stdout; anything else goes to stderr.
 */

const SECTIONS = [
	"chapters",
	"mechanisms",
	"toolkit",
	"glossary",
	"examples",
] as const;

const root = repoRoot();
const books = listBookDirs();
const book = optionalArg("--book") ?? books[0];

if (!book || !books.includes(book)) {
	process.stderr.write(
		`bookkit mcp: unknown book "${book ?? ""}". Available: ${books.join(", ")}\n`,
	);
	process.exit(1);
}

const listMdx = (dir: string): string[] =>
	existsSync(dir)
		? readdirSync(dir, { recursive: true })
				.map(String)
				.filter((file) => /\.mdx?$/.test(file))
		: [];

/** Raw sources keyed as the apps' `import.meta.glob` keys them. */
const loadRawModules = (slug: string): BookContentRawModules => {
	const contentRoot = join(root, "apps", slug, "src", "content", "book");
	const modules = {} as BookContentRawModules;
	for (const section of SECTIONS) {
		const dir = join(contentRoot, section);
		modules[section] = Object.fromEntries(
			listMdx(dir).map((file) => [
				`../content/book/${section}/${file}`,
				readFileSync(join(dir, file), "utf8"),
			]),
		);
	}
	return modules;
};

const config = await loadBookConfigSummary(book);
const options: McpEndpointOptions = {
	bookTitle: config.title,
	bookSlug: book,
	contentRawModules: loadRawModules(book),
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

const respond = (request: unknown) => {
	if (!isRequest(request)) {
		return createJsonRpcError(
			null,
			-32600,
			"Invalid request: expected a JSON-RPC object with a method.",
		);
	}
	try {
		return handleRequest(options, request);
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
		const responses = message.map(respond).filter(Boolean);
		if (responses.length > 0) send(responses);
		return;
	}
	const response = respond(message);
	if (response) send(response);
});

process.stderr.write(
	`bookkit mcp: serving ${relative(root, join(root, "apps", book))} over stdio\n`,
);
