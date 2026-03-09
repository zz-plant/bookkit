import type { McpEndpointOptions, ToolResponse } from "../types";
import type { ToolName } from "../tool-definitions";

export type ToolExpectedRuntimeClass = "instant" | "short" | "moderate" | "long";

export type ToolSideEffectLevel = "read-only" | "local-read/compute" | "local-write";

export type ToolIdempotencyGuarantee =
  | "idempotent-safe-retry"
  | "idempotent-retry-after-remediation"
  | "non-idempotent";

export type ToolFailureClass =
  | "validation"
  | "not-found"
  | "conflict"
  | "timeout"
  | "transient-command"
  | "filesystem"
  | "configuration"
  | "unknown";

export type ToolDefinitionMetadata = {
  name: ToolName;
  description: string;
  expectedRuntime: string;
  expectedRuntimeClass: ToolExpectedRuntimeClass;
  sideEffectLevel: ToolSideEffectLevel;
  idempotent: boolean;
  idempotencyGuarantee: ToolIdempotencyGuarantee;
  retryGuidance: string;
  retryPolicyGuidance: string;
  failureClassTaxonomy: readonly ToolFailureClass[];
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: readonly string[];
    additionalProperties: boolean;
  };
};

export type ToolHandlerContext = {
  options: McpEndpointOptions;
  args?: Record<string, unknown>;
};

export type ToolHandler = (context: ToolHandlerContext) => ToolResponse;

export type ToolHandlerMap = Record<ToolName, ToolHandler>;
