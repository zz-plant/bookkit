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
  supportsChunking?: boolean;
  supportsSectionIndex?: boolean;
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
  sectionId?: string;
  offset?: number;
  limit?: number;
};

export type ResourceListParams = {
  cursor?: string;
  limit?: number;
  kind?: "content" | "governance";
  section?: string;
};

export type ContentTypeKey = keyof BookContentRawModules;

export type ResourceKind = "content" | "governance";

export type ResourceCategory = {
  key: ResourceKind;
  description: string;
  sections: ContentTypeKey[] | ["governance"];
};

export type ToolCategory = "workspace" | "discovery" | "content" | "governance";

export type ToolSafetyFlags = {
  read_only: boolean;
  mutating: boolean;
  requires_guard: boolean;
};

export type DiscoveryQueryPattern = {
  label: string;
  intent: string;
  sequence: string[];
};

export type DiscoveryResponse = {
  ok: true;
  bookTitle: string;
  description: string | null;
  resourceCount: number;
  resourceKinds: ResourceKind[];
  resourceSections: ContentTypeKey[];
  resourceCategories: ResourceCategory[];
  resourceReadOptions: {
    supportsLineRanges: boolean;
    supportsSectionIndex: boolean;
    supportsChunking: boolean;
    params: ["startLine", "endLine", "sectionId", "offset", "limit"];
  };
  tools: string[];
  toolCategories: Record<ToolCategory, string[]>;
  toolMetadata: unknown;
  safetyFlags: ToolSafetyFlags;
  rateLimits: {
    requestsPerMinute: number;
    burst: number;
    guidance: string;
    retryAfterSeconds: number;
  };
  recommendedQueryPatterns: DiscoveryQueryPattern[];
  agentProfile: {
    safetyMode: "safe-first";
    mutatingTools: string[];
    safetyFlags: {
      defaultToolMode: "read-only";
      mutatingToolsRequireExplicitIntent: true;
    };
    recommendedQueryOrder: string[];
    resources: {
      supportsLineRanges: boolean;
      supportsSectionIndex: boolean;
      supportsChunking: boolean;
      supportsListFiltering: boolean;
      supportsListPagination: boolean;
    };
  };
};

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
export const RESOURCE_CATEGORIES: ResourceCategory[] = [
  {
    key: "content",
    description: "Book content resources for chapters, mechanisms, toolkit, glossary, and examples.",
    sections: CONTENT_TYPES,
  },
  {
    key: "governance",
    description: "Workspace governance resources such as AGENTS, CONTRIBUTING, and skills docs.",
    sections: ["governance"],
  },
];
