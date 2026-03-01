import { jsonResponse, tryParseJsonBody } from "../utils/http";
import { handleRequest, createJsonRpcError } from "./jsonrpc-router";
import { listResources } from "./resource-utils";
import { TOOL_DEFINITIONS, TOOL_NAMES } from "./tool-definitions";
import { DEFAULT_RESOURCE_PREFIX, type ContentTypeKey, type JsonRpcRequest, type McpEndpointOptions, type McpResourceInput } from "./types";

export const createBookMcpEndpoint = (options: McpEndpointOptions) => {
  const resourcePrefix = options.resourcePrefix ?? DEFAULT_RESOURCE_PREFIX;

  return {
    GET: () => {
      const resources = listResources(options.contentRawModules, resourcePrefix, options.governanceResources);
      const resourceKinds = Array.from(new Set(resources.map((resource) => resource.kind)));
      const resourceSections = Array.from(
        new Set(resources.map((resource) => resource.section).filter((section): section is ContentTypeKey => Boolean(section))),
      );
      return jsonResponse({
        ok: true,
        bookTitle: options.bookTitle,
        description: options.bookDescription ?? null,
        resourceCount: resources.length,
        resourceKinds,
        resourceSections,
        resourceReadOptions: {
          supportsLineRanges: true,
          params: ["startLine", "endLine"],
        },
        tools: TOOL_NAMES,
        toolMetadata: TOOL_DEFINITIONS,
        rateLimits: {
          requestsPerMinute: 120,
          burst: 30,
          guidance: "On throttling, back off and retry read-only operations first.",
        },
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
            supportsListFiltering: true,
            supportsListPagination: true,
          },
        },
      });
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
