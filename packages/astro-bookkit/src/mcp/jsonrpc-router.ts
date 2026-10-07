import {
	buildResourceChunk,
	listPagedResources,
	listResources,
	readResource,
} from "./resource-utils";
import { isToolName, TOOL_DEFINITIONS } from "./tool-definitions";
import { runTool } from "./tool-handlers";
import {
	DEFAULT_RESOURCE_PREFIX,
	type JsonRpcError,
	type JsonRpcRequest,
	type JsonRpcSuccess,
	type McpEndpointOptions,
	type ResourceListParams,
	type ResourceReadParams,
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

export const handleRequest = (
	options: McpEndpointOptions,
	request: JsonRpcRequest,
): JsonRpcSuccess | JsonRpcError | null => {
	const id = request.id;

	const response = (() => {
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
			case "tools/list":
				return {
					jsonrpc: "2.0" as const,
					id,
					result: { tools: TOOL_DEFINITIONS },
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
				const result = runTool(options, params.name, params.arguments);
				return {
					jsonrpc: "2.0" as const,
					id,
					result: { content: [{ type: "json", json: result }] },
				};
			}
			default:
				return createJsonRpcError(id, -32601, "Method not found.");
		}
	})();

	return id === undefined ? null : response;
};
