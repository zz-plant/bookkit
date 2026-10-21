import type { ToolName } from "../tool-definitions";
import type { McpEndpointOptions, ToolResponse } from "../types";

export type ToolExpectedRuntimeClass =
	| "instant"
	| "short"
	| "moderate"
	| "long";

export type ToolSideEffectLevel =
	| "read-only"
	| "local-read/compute"
	| "local-write";

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

export type ToolSafetyLevel = "read_only" | "mutating" | "requires_guard";

export type ToolDefinitionMetadata = {
	name: ToolName;
	description: string;
	safety: ToolSafetyLevel;
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

export type ToolHandler = (
	context: ToolHandlerContext,
) => ToolResponse | Promise<ToolResponse>;

export type ToolHandlerMap = Record<ToolName, ToolHandler>;
