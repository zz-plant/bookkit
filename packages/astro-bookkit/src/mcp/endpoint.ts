import { jsonResponse, tryParseJsonBody } from "../utils/http";
import { handleRequest, createJsonRpcError } from "./jsonrpc-router";
import { listResources } from "./resource-utils";
import { TOOL_DEFINITIONS, TOOL_NAMES } from "./tool-definitions";
import {
  DEFAULT_RESOURCE_PREFIX,
  RESOURCE_CATEGORIES,
  type ContentTypeKey,
  type DiscoveryResponse,
  type JsonRpcRequest,
  type McpEndpointOptions,
  type McpResourceInput,
} from "./types";

export const createBookMcpEndpoint = (options: McpEndpointOptions) => {
  const resourcePrefix = options.resourcePrefix ?? DEFAULT_RESOURCE_PREFIX;

  return {
    GET: () => {
      const resources = listResources(options.contentRawModules, resourcePrefix, options.governanceResources);
      const resourceKinds = Array.from(new Set(resources.map((resource) => resource.kind)));
      const resourceSections = Array.from(
        new Set(resources.map((resource) => resource.section).filter((section): section is ContentTypeKey => Boolean(section))),
      );
      const discoveryResponse: DiscoveryResponse = {
        ok: true,
        bookTitle: options.bookTitle,
        description: options.bookDescription ?? null,
        resourceCount: resources.length,
        resourceKinds,
        resourceSections,
        resourceReadOptions: {
          supportsLineRanges: true,
          supportsSectionIndex: true,
          supportsChunking: true,
          params: ["startLine", "endLine", "sectionId", "offset", "limit"],
        },
        tools: TOOL_NAMES,
        toolCategories: {
          workspace: ["bookkit.create_book"],
          discovery: ["bookkit.list_books", "bookkit.list_content", "bookkit.list_skills"],
          content: ["bookkit.read_book", "bookkit.list_mechanisms"],
          governance: ["bookkit.validate_book", "bookkit.check_separation"],
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
          guidance: "On throttling, back off and retry read-only operations first.",
          retryAfterSeconds: 10,
        },
        recommendedQueryPatterns: [
          {
            label: "governance-first",
            intent: "Read contributor and policy constraints before tool calls.",
            sequence: ["resources/list?kind=governance", "resources/read?uri=bookkit://governance/AGENTS.md"],
          },
          {
            label: "mechanism-discovery",
            intent: "Inventory mechanisms and then fetch targeted content chunks.",
            sequence: ["tools/call(bookkit.list_mechanisms)", "resources/read?uri=bookkit://content/mechanisms/<slug>"],
          },
          {
            label: "safe-mutation",
            intent: "Validate existing state before any mutating workspace operation.",
            sequence: ["tools/call(bookkit.list_books)", "tools/call(bookkit.create_book)", "tools/call(bookkit.validate_book)"],
          },
        ],
        agentProfile: {
          safetyMode: "safe-first",
          mutatingTools: ["bookkit.create_book"],
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
    POST: async ({ request }: { request: Request }) => {
      const parsed = await tryParseJsonBody(request);
      if (!parsed.ok) return jsonResponse(createJsonRpcError(null, -32700, "Invalid JSON payload."), 400);

      const payload = parsed.value;
      if (!payload) return jsonResponse(createJsonRpcError(null, -32600, "Missing JSON-RPC payload."), 400);

      if (Array.isArray(payload)) {
        const responses = payload.filter((item): item is JsonRpcRequest => Boolean(item)).map((item) => handleRequest(options, item));
        return jsonResponse(responses);
      }

      return jsonResponse(handleRequest(options, payload as JsonRpcRequest));
    },
  };
};

export type { McpEndpointOptions, McpResourceInput };
