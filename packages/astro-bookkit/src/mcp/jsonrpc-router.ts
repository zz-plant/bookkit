import {
	buildResourceChunk,
	listPagedResources,
	listResources,
	readResource,
} from "./resource-utils";
import { isToolName, TOOL_DEFINITIONS } from "./tool-definitions";
import { runTool } from "./tool-handlers";
import type { ToolDefinitionMetadata } from "./tool-handlers/types";
import {
	DEFAULT_RESOURCE_PREFIX,
	type JsonRpcError,
	type JsonRpcRequest,
	type JsonRpcSuccess,
	type McpEndpointOptions,
	type ResourceListParams,
	type ResourceReadParams,
	type ToolResponse,
} from "./types";

export const createJsonRpcError = (
	id: JsonRpcError["id"],
	code: number,
	message: string,
): JsonRpcError => ({
	jsonrpc: "2.0",
	id,
	error: { code, message },
});

export const createInvalidParamsError = (
	id: JsonRpcError["id"],
	detail: string,
): JsonRpcError => {
	return createJsonRpcError(id, -32602, `Invalid params: ${detail}`);
};

/**
 * MCP tool annotations, from each tool's metadata, for clients that decide
 * from them whether to ask before a call.
 */
const withAnnotations = (tool: ToolDefinitionMetadata) => ({
	...tool,
	annotations: {
		title: tool.name.replace(/^bookkit\./, "").replace(/_/g, " "),
		readOnlyHint: tool.sideEffectLevel !== "local-write",
		destructiveHint: tool.name === "bookkit.write_content",
		idempotentHint: tool.idempotent,
		openWorldHint: false,
	},
});

const TOOLS_WITH_ANNOTATIONS = TOOL_DEFINITIONS.map(withAnnotations);

/**
 * Arguments a tool does not take, as a tool error: a misspelled name would
 * otherwise be ignored, and the call would answer about something else (the
 * served book instead of the one meant). Required arguments are the
 * handlers' to report, with what to pass.
 */
const unknownArguments = (
	tool: ToolDefinitionMetadata,
	args: unknown,
): ToolResponse | null => {
	const known = Object.keys(tool.inputSchema.properties);
	const takes = `It takes: ${known.join(", ") || "no arguments"}.`;
	if (args !== undefined && (typeof args !== "object" || Array.isArray(args))) {
		return {
			ok: false,
			summary: `arguments must be an object for ${tool.name}.`,
			error: {
				cause: "arguments is not an object",
				machineCode: "TOOL_ARGUMENTS",
				nextAction: `Call again with arguments as an object. ${takes}`,
			},
		};
	}
	if (tool.inputSchema.additionalProperties) return null;
	const unknown = Object.keys((args as Record<string, unknown>) ?? {}).filter(
		(name) => !known.includes(name),
	);
	if (unknown.length === 0) return null;
	return {
		ok: false,
		summary: `${tool.name} takes no argument ${unknown.map((name) => JSON.stringify(name)).join(", ")}.`,
		error: {
			cause: `Unknown argument(s): ${unknown.join(", ")}.`,
			machineCode: "TOOL_ARGUMENTS",
			nextAction: `Call again without them. ${takes}`,
		},
	};
};

export const handleRequest = async (
	options: McpEndpointOptions,
	request: JsonRpcRequest,
): Promise<JsonRpcSuccess | JsonRpcError | null> => {
	const id = request.id;

	const response = await (async () => {
		switch (request.method) {
			case "initialize":
				return {
					jsonrpc: "2.0" as const,
					id,
					result: {
						protocolVersion: "2024-11-05",
						serverInfo: {
							name: "bookkit-mcp",
							version: "0.1.0",
							bookTitle: options.bookTitle,
						},
						capabilities: {
							resources: {
								readRanges: true,
								listFiltering: true,
								listPagination: true,
							},
							tools: { listChanged: false, metadata: true },
						},
					},
				};
			case "resources/list": {
				const listed = listResources(
					options.contentRawModules,
					options.resourcePrefix ?? DEFAULT_RESOURCE_PREFIX,
					options.governanceResources,
				);
				const paged = listPagedResources(
					listed,
					request.params as ResourceListParams | undefined,
				);
				return {
					jsonrpc: "2.0" as const,
					id,
					result: { resources: paged.resources, nextCursor: paged.nextCursor },
				};
			}
			case "resources/read": {
				const params = request.params as ResourceReadParams | undefined;
				const uri = params?.uri;
				if (!uri)
					return createJsonRpcError(id, -32602, "Missing resource URI.");
				const resource = readResource(
					options.contentRawModules,
					options.resourcePrefix ?? DEFAULT_RESOURCE_PREFIX,
					uri,
					options.governanceResources,
				);
				if (!resource) {
					return createJsonRpcError(
						id,
						-32602,
						`Resource not found for URI: ${uri}. Call resources/list to discover valid URIs, then retry resources/read.`,
					);
				}
				const chunk = buildResourceChunk(uri, resource.text, params ?? {});
				if (!chunk) {
					return createInvalidParamsError(
						id,
						`Unknown sectionId: ${params?.sectionId}. Call resources/read without sectionId to inspect available section metadata and retry.`,
					);
				}
				return {
					jsonrpc: "2.0" as const,
					id,
					result: {
						contents: [
							{
								uri,
								mimeType: resource.mimeType,
								text: chunk.text,
								metadata: {
									chunkId: chunk.chunkId,
									startLine: chunk.startLine,
									endLine: chunk.endLine,
									totalLines: chunk.totalLines,
									sectionId: chunk.sectionId,
									sectionStartLine: chunk.sectionStartLine,
									sectionEndLine: chunk.sectionEndLine,
									offset: chunk.offset,
									limit: chunk.limit,
									totalSectionLines: chunk.totalSectionLines,
									sectionIndex: chunk.sectionIndex,
								},
							},
						],
					},
				};
			}
			case "ping":
				return { jsonrpc: "2.0" as const, id, result: {} };
			case "tools/list":
				return {
					jsonrpc: "2.0" as const,
					id,
					result: { tools: TOOLS_WITH_ANNOTATIONS },
				};
			case "tools/call": {
				const params = request.params as
					| { name?: string; arguments?: Record<string, unknown> }
					| undefined;
				if (!params?.name)
					return createInvalidParamsError(id, "Missing tool name.");
				if (!isToolName(params.name))
					return createJsonRpcError(
						id,
						-32601,
						`Unknown tool: ${params.name}.`,
					);
				const definition = TOOL_DEFINITIONS.find(
					(tool) => tool.name === params.name,
				);
				const result =
					(definition && unknownArguments(definition, params.arguments)) ||
					(await runTool(options, params.name, params.arguments));
				// MCP content items are text; `structuredContent` carries the same
				// result for clients that read JSON directly.
				return {
					jsonrpc: "2.0" as const,
					id,
					result: {
						content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
						structuredContent: result,
						isError: !result.ok,
					},
				};
			}
			default:
				return createJsonRpcError(id, -32601, "Method not found.");
		}
	})();

	return id === undefined ? null : response;
};
