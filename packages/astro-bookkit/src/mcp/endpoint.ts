import {
	AUTHOR_TOKEN_ENV,
	type AuthorTokenOptions,
	checkAuthorToken,
} from "../utils/author-token";
import { jsonResponse, tryParseJsonBody } from "../utils/http";
import { createJsonRpcError, handleRequest } from "./jsonrpc-router";
import { listResources } from "./resource-utils";
import { TOOL_DEFINITIONS, TOOL_NAMES } from "./tool-definitions";
import {
	type ContentTypeKey,
	DEFAULT_RESOURCE_PREFIX,
	type DiscoveryResponse,
	type JsonRpcRequest,
	type McpEndpointOptions,
	type McpResourceInput,
	RESOURCE_CATEGORIES,
	type ToolCallTransport,
} from "./types";

const ELSEWHERE =
	"To call tools, run bun run bookkit dev <book> and POST to /api/mcp.json there, or use the stdio MCP server: bun run mcp";

/**
 * A prerendered copy of this endpoint is a file on a static host: it serves the
 * discovery manifest and nothing answers POST.
 */
const toolCallTransport = (isPrerendered: boolean): ToolCallTransport =>
	isPrerendered
		? {
				served: false,
				note: `This is a static build: this file is the discovery manifest, and nothing here answers POST. ${ELSEWHERE}`,
			}
		: {
				served: true,
				note: `POST JSON-RPC 2.0 requests (one object or an array) to this URL with Content-Type: application/json. Outside bookkit dev, tools/call needs Authorization: Bearer <token>, where the token is ${AUTHOR_TOKEN_ENV} in the server's environment; resources and tools/list need none. The same tools run over stdio with bun run mcp.`,
			};

/** Large enough for check_content on a long chapter. */
const MAX_BODY_BYTES = 2 * 1024 * 1024;

/**
 * Tool calls run commands and write files in the workspace (create_book,
 * compile_book, export_book), so on a deployed server they need the author
 * token. Reading resources and listing tools stay open: they show the book's
 * published content. `bookkit dev` serves this machine only and needs no token.
 */
const callsTools = (payload: unknown): boolean =>
	(Array.isArray(payload) ? payload : [payload]).some(
		(item) =>
			typeof item === "object" &&
			item !== null &&
			(item as { method?: unknown }).method === "tools/call",
	);

const firstId = (payload: unknown): JsonRpcRequest["id"] | null => {
	const first = Array.isArray(payload) ? payload[0] : payload;
	const id = (first as { id?: unknown } | null)?.id;
	return typeof id === "string" || typeof id === "number" ? id : null;
};

export const createBookMcpEndpoint = (
	options: McpEndpointOptions & {
		/** How tool calls are authorized; tests replace `isDev`. */
		toolCallAuth?: Pick<AuthorTokenOptions, "isDev">;
	},
) => {
	const resourcePrefix = options.resourcePrefix ?? DEFAULT_RESOURCE_PREFIX;

	return {
		// Astro passes `isPrerendered`; other callers may leave it out.
		GET: ({ isPrerendered = false }: { isPrerendered?: boolean } = {}) => {
			const resources = listResources(
				options.contentRawModules,
				resourcePrefix,
				options.governanceResources,
			);
			const resourceKinds = Array.from(
				new Set(resources.map((resource) => resource.kind)),
			);
			const resourceSections = Array.from(
				new Set(
					resources
						.map((resource) => resource.section)
						.filter((section): section is ContentTypeKey => Boolean(section)),
				),
			);
			const discoveryResponse: DiscoveryResponse = {
				ok: true,
				bookTitle: options.bookTitle,
				description: options.bookDescription ?? null,
				toolCalls: toolCallTransport(isPrerendered),
				resourceCount: resources.length,
				resourceKinds,
				resourceSections,
				resourceReadOptions: {
					supportsLineRanges: true,
					supportsSectionIndex: true,
					supportsChunking: true,
					params: ["startLine", "endLine", "sectionId", "offset", "limit"],
				},
				tools: [...TOOL_NAMES],
				toolCategories: {
					workspace: ["bookkit.create_book"],
					discovery: [
						"bookkit.list_books",
						"bookkit.list_content",
						"bookkit.list_skills",
					],
					content: [
						"bookkit.read_book",
						"bookkit.list_mechanisms",
						"bookkit.find_similar_mechanisms",
					],
					governance: [
						"bookkit.validate_book",
						"bookkit.check_separation",
						"bookkit.check_corpus",
						"bookkit.get_content_contract",
						"bookkit.check_content",
					],
					pipeline: ["bookkit.compile_book", "bookkit.export_book"],
				},
				toolMetadata: TOOL_DEFINITIONS,
				resourceCategories: RESOURCE_CATEGORIES,
				safetyFlags: {
					read_only: true,
					mutating: true,
					requires_guard: true,
				},
				rateLimits: {
					requestsPerMinute: 120,
					burst: 30,
					guidance:
						"On throttling, back off and retry read-only operations first.",
					retryAfterSeconds: 10,
				},
				recommendedQueryPatterns: [
					{
						label: "governance-first",
						intent:
							"Read contributor and policy constraints before tool calls.",
						sequence: [
							"resources/list?kind=governance",
							"resources/read?uri=bookkit://governance/AGENTS.md",
						],
					},
					{
						label: "mechanism-discovery",
						intent:
							"Inventory mechanisms and then fetch targeted content chunks.",
						sequence: [
							"tools/call(bookkit.list_mechanisms)",
							"resources/read?uri=bookkit://content/mechanisms/<slug>",
						],
					},
					{
						label: "safe-mutation",
						intent:
							"Validate existing state before any mutating workspace operation.",
						sequence: [
							"tools/call(bookkit.list_books)",
							"tools/call(bookkit.validate_book)",
							"tools/call(bookkit.compile_book)",
							"tools/call(bookkit.export_book)",
						],
					},
				],
				agentProfile: {
					safetyMode: "safe-first",
					mutatingTools: [
						"bookkit.compile_book",
						"bookkit.create_book",
						"bookkit.export_book",
					],
					safetyFlags: {
						defaultToolMode: "read-only",
						mutatingToolsRequireExplicitIntent: true,
					},
					recommendedQueryOrder: [
						"bookkit://governance/AGENTS.md",
						"bookkit://governance/CONTRIBUTING.md",
						"bookkit://governance/README.md",
						"bookkit://governance/.codex/skills/README.md",
					],
					resources: {
						supportsLineRanges: true,
						supportsSectionIndex: true,
						supportsChunking: true,
						supportsListFiltering: true,
						supportsListPagination: true,
					},
				},
			};

			return jsonResponse(discoveryResponse);
		},
		POST: async ({
			request,
			isPrerendered = false,
		}: {
			request: Request;
			isPrerendered?: boolean;
		}) => {
			// Astro hands a prerendered route a request without its body, which
			// would otherwise read as a parse error.
			if (isPrerendered)
				return jsonResponse(
					createJsonRpcError(
						null,
						-32000,
						`Tool calls are not served here: this route is prerendered as a static file. ${ELSEWHERE}`,
					),
					405,
				);

			const parsed = await tryParseJsonBody(request, {
				maxBytes: MAX_BODY_BYTES,
			});
			if (!parsed.ok && parsed.tooLarge)
				return jsonResponse(
					createJsonRpcError(
						null,
						-32600,
						`Invalid request: ${parsed.error}. Send smaller requests, for example one tool call at a time.`,
					),
					413,
				);
			if (!parsed.ok)
				return jsonResponse(
					createJsonRpcError(
						null,
						-32700,
						`Parse error: the request body is not valid JSON (${parsed.error}). Send a JSON-RPC 2.0 request object, or an array of them, with Content-Type: application/json.`,
					),
					400,
				);

			const payload = parsed.value;
			if (!payload)
				return jsonResponse(
					createJsonRpcError(
						null,
						-32600,
						'Invalid request: the body holds no JSON-RPC request. Send one such as {"jsonrpc":"2.0","id":1,"method":"tools/list"}.',
					),
					400,
				);

			if (callsTools(payload)) {
				const check = await checkAuthorToken(request, {
					route: "POST /api/mcp.json tools/call",
					openInDev: true,
					...options.toolCallAuth,
				});
				if (!check.ok)
					return jsonResponse(
						createJsonRpcError(
							firstId(payload),
							check.status === 401 ? -32001 : -32603,
							check.status === 401
								? `${check.error} Tool calls on a deployed server need the token set as ${AUTHOR_TOKEN_ENV} where the server runs; resources/list, resources/read, and tools/list need none.`
								: check.error,
						),
						check.status,
						check.status === 401
							? { "WWW-Authenticate": 'Bearer realm="bookkit"' }
							: {},
					);
			}

			if (Array.isArray(payload)) {
				const responses = payload
					.filter((item): item is JsonRpcRequest => Boolean(item))
					.map((item) => handleRequest(options, item))
					.filter(
						(
							response,
						): response is NonNullable<ReturnType<typeof handleRequest>> =>
							response !== null,
					);

				if (responses.length === 0) return new Response(null, { status: 204 });

				return jsonResponse(responses);
			}

			const response = handleRequest(options, payload as JsonRpcRequest);
			if (response === null) return new Response(null, { status: 204 });

			return jsonResponse(response);
		},
	};
};

export type { McpEndpointOptions, McpResourceInput };
