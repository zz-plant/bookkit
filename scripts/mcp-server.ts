import { basename, join, relative } from "node:path";
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
import { previewFolder } from "../packages/astro-bookkit/src/proposals";
import { SECTION_DIRECTORIES } from "../packages/astro-bookkit/src/validators/content-check";
import { listBookDirs, optionalArg, repoRoot, slugify } from "./_lib";
import { loadBookConfigSummary } from "./lib/authoring";
import { exitOnHelp, readFocusBook } from "./lib/cli";
import { readFolder, titleForFolder } from "./lib/folder-report";
import { loadRawModules } from "./lib/raw-modules";

/**
 * mcp — Bookkit's MCP tools over stdio, for agents working in this repo
 * or on any standalone Markdown/runbook folder (`--dir`). The same router
 * serves the book apps' HTTP endpoint; this needs no dev server.
 *
 * One JSON-RPC message per line on stdin and stdout; anything else goes to
 * stderr. A long call (compile_book) does not hold up the others: each
 * answers when it is done.
 */

exitOnHelp({
	summary:
		"Serves Bookkit's MCP tools over stdio, for agents working in this\nworkspace or on any folder of Markdown (--dir): one JSON-RPC message\nper line on stdin and stdout. Needs no dev server.",
	usage: [
		"bun run mcp [--book <book>]",
		"bun run mcp --dir <folder> [--frame <slug>] [--release]",
	],
	options: [
		[
			"--book <book>",
			"The book the content tools read (default: the current\none, set with bookkit use, else the first in apps/);\nevery tool also takes `book`",
		],
		[
			"--dir <folder>",
			"Serve any folder of Markdown/runbooks without a book app",
		],
		[
			"--frame <slug>",
			"With --dir: require steps of this frame (e.g. runbook)",
		],
		["--release", "With --dir: validate using release/published rules"],
	],
	examples: [
		"bun run mcp",
		"bun run mcp -- --book on-call",
		"bun run mcp -- --dir ./docs/runbooks --frame runbook",
	],
});

const dirArg = optionalArg("--dir");
const frameArg = optionalArg("--frame") ?? undefined;
const releaseArg = process.argv.includes("--release");

let options: McpEndpointOptions;
let servingLabel: string;

if (dirArg) {
	const folder = readFolder(dirArg);
	if ("error" in folder) {
		process.stderr.write(`bookkit mcp: ${folder.error}\n`);
		process.exit(1);
	}
	const preview = previewFolder(folder.files, {
		frame: frameArg,
		requireFrameSteps: Boolean(frameArg),
		releaseMode: releaseArg,
	});
	const contentRawModules: BookContentRawModules = {
		chapters: {},
		mechanisms: {},
		toolkit: {},
		glossary: {},
		examples: {},
	};
	const sectionByPath = new Map(
		preview.documents.map((doc) => [doc.path, doc.section]),
	);
	for (const file of folder.files) {
		const section = sectionByPath.get(file.path) ?? "chapter";
		const dirName = SECTION_DIRECTORIES[section] as keyof BookContentRawModules;
		const normalized = file.path.split("\\").join("/");
		contentRawModules[dirName][`../content/book/${dirName}/${normalized}`] =
			file.source;
	}
	const folderSlug = slugify(basename(folder.root)) || "folder";
	const bookTitle = titleForFolder(preview, folderSlug);
	options = {
		bookTitle,
		bookSlug: folderSlug,
		contentRawModules,
		folderMode: {
			dir: folder.root,
			frame: preview.frame.slug,
			releaseMode: releaseArg,
			validate: async (opts) => {
				const latest = readFolder(dirArg);
				if ("error" in latest) {
					return {
						ok: false,
						frame: frameArg,
						findings: [
							{
								level: "error",
								code: "FOLDER_UNREADABLE",
								message: latest.error,
							},
						],
					};
				}
				const run = previewFolder(latest.files, {
					frame: frameArg,
					requireFrameSteps: Boolean(frameArg),
					releaseMode: releaseArg || opts?.releaseMode,
				});
				const findings = [
					...run.findings,
					...run.documents.flatMap((doc) =>
						doc.findings.map((finding) => ({ ...finding, file: doc.path })),
					),
				];
				return {
					ok: run.errors === 0,
					frame: run.frame.slug,
					findings,
				};
			},
		},
	};
	servingLabel = folder.root;
} else {
	const root = repoRoot();
	const books = listBookDirs();
	const book = optionalArg("--book") ?? readFocusBook(books) ?? books[0];

	if (!book || !books.includes(book)) {
		process.stderr.write(
			`bookkit mcp: unknown book "${book ?? ""}". Available: ${books.join(", ") || "(none; pass --dir <folder>)"}\n`,
		);
		process.exit(1);
	}

	const config = await loadBookConfigSummary(book);
	options = {
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
	servingLabel = relative(root, join(root, "apps", book));
}

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

process.stderr.write(`bookkit mcp: serving ${servingLabel} over stdio\n`);
