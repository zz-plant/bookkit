import type { BookContentRawModules } from "../book/entrypoints";

export type McpEndpointOptions = {
  bookTitle: string;
  bookSlug?: string;
  bookDescription?: string;
  contentRawModules: BookContentRawModules;
  resourcePrefix?: string;
  governanceResources?: McpResourceInput[];
  workspaceRoot?: string;
};

export type McpResourceInput = {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  text: string;
};

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: unknown;
};

export type JsonRpcSuccess = {
  jsonrpc: "2.0";
  id?: number | string | null;
  result: unknown;
};

export type JsonRpcError = {
  jsonrpc: "2.0";
  id?: number | string | null;
  error: {
    code: number;
    message: string;
  };
};

export type ResourceReadParams = {
  uri?: string;
  startLine?: number;
  endLine?: number;
};

export type ResourceListParams = {
  cursor?: string;
  limit?: number;
  kind?: "content" | "governance";
  section?: string;
};

export type ContentTypeKey = keyof BookContentRawModules;

export type ToolResponse = {
  ok: boolean;
  summary: string;
  payload?: Record<string, unknown>;
  error?: {
    cause: string;
    nextAction: string;
  };
};

export const DEFAULT_RESOURCE_PREFIX = "bookkit://content/";
export const CONTENT_TYPES: ContentTypeKey[] = ["chapters", "mechanisms", "toolkit", "glossary", "examples"];
