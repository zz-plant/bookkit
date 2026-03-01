import type { McpEndpointOptions, ToolResponse } from "../types";
import type { ToolName } from "../tool-definitions";

export type ToolHandlerContext = {
  options: McpEndpointOptions;
  args?: Record<string, unknown>;
};

export type ToolHandler = (context: ToolHandlerContext) => ToolResponse;

export type ToolHandlerMap = Record<ToolName, ToolHandler>;
