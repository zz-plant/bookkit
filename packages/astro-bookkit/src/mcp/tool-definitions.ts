import type { ToolDefinitionMetadata } from "./tool-handlers/types";
import { CONTENT_TYPES } from "./types";

export const TOOL_NAMES = [
	"bookkit.create_book",
	"bookkit.read_book",
	"bookkit.list_books",
	"bookkit.list_content",
	"bookkit.list_skills",
	"bookkit.list_mechanisms",
	"bookkit.validate_book",
	"bookkit.compile_book",
	"bookkit.export_book",
	"bookkit.check_separation",
	"bookkit.check_corpus",
	"bookkit.find_similar_mechanisms",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];
export const TOOL_NAME_SET: ReadonlySet<string> = new Set<string>(TOOL_NAMES);
export const isToolName = (value: unknown): value is ToolName =>
	typeof value === "string" && TOOL_NAME_SET.has(value);

export const TOOL_DEFINITIONS: readonly ToolDefinitionMetadata[] = [
	{
		name: "bookkit.create_book",
		description:
			"Scaffold a new book app in apps/<book> using the workspace template command.",
		safety: "requires_guard",
		rateLimit: {
			maxPerMinute: 5,
			guidance:
				"Limit book creation to avoid workspace clutter. Clean up failed scaffolds before retrying.",
		},
		expectedRuntime: "<=30s",
		expectedRuntimeClass: "moderate",
		sideEffectLevel: "local-write",
		idempotent: false,
		idempotencyGuarantee: "non-idempotent",
		retryGuidance:
			"Do not blindly retry. If creation fails, inspect stderr and remove partial output before rerunning.",
		retryPolicyGuidance:
			"Retry only after inspecting stderr and clearing any partially created app directory to avoid duplicate or conflicting scaffolds.",
		failureClassTaxonomy: [
			"validation",
			"conflict",
			"filesystem",
			"transient-command",
			"unknown",
		],
		inputSchema: {
			type: "object",
			properties: {
				book: {
					type: "string",
					description:
						"Required slug for the new book (for example, running-hot).",
				},
				title: {
					type: "string",
					description: "Optional display title for the generated book config.",
				},
				template: {
					type: "string",
					description:
						"Optional template book slug to copy from. Defaults to running-hot.",
				},
			},
			required: ["book"],
			additionalProperties: false,
		},
	},
	{
		name: "bookkit.read_book",
		description:
			"Read current book content records by section and optional slug.",
		safety: "read_only",
		expectedRuntime: "<1s",
		expectedRuntimeClass: "instant",
		sideEffectLevel: "read-only",
		idempotent: true,
		idempotencyGuarantee: "idempotent-safe-retry",
		retryGuidance: "Safe to retry.",
		retryPolicyGuidance:
			"Retry immediately for transient transport or timeout failures; repeated retries are safe.",
		failureClassTaxonomy: ["validation", "not-found", "timeout", "unknown"],
		inputSchema: {
			type: "object",
			properties: {
				section: {
					type: "string",
					enum: CONTENT_TYPES,
					description: "Optional content section filter.",
				},
				slug: {
					type: "string",
					description: "Optional slug filter inside the selected section.",
				},
			},
			additionalProperties: false,
		},
	},
	{
		name: "bookkit.list_books",
		description: "List available book slugs in this workspace.",
		safety: "read_only",
		expectedRuntime: "<10s",
		expectedRuntimeClass: "short",
		sideEffectLevel: "read-only",
		idempotent: true,
		idempotencyGuarantee: "idempotent-safe-retry",
		retryGuidance: "Safe to retry on timeout or transient command errors.",
		retryPolicyGuidance:
			"Use bounded retries with backoff for timeout or transient command errors.",
		failureClassTaxonomy: [
			"timeout",
			"transient-command",
			"filesystem",
			"unknown",
		],
		inputSchema: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
	},
	{
		name: "bookkit.list_content",
		description: "List available content section counts for this book.",
		safety: "read_only",
		expectedRuntime: "<1s",
		expectedRuntimeClass: "instant",
		sideEffectLevel: "read-only",
		idempotent: true,
		idempotencyGuarantee: "idempotent-safe-retry",
		retryGuidance: "Safe to retry.",
		retryPolicyGuidance:
			"Retry immediately for transient failures; operation is read-only and deterministic for a fixed workspace state.",
		failureClassTaxonomy: ["configuration", "timeout", "unknown"],
		inputSchema: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
	},
	{
		name: "bookkit.list_skills",
		description:
			"List local agent skills that can guide contribution workflows.",
		safety: "read_only",
		expectedRuntime: "<1s",
		expectedRuntimeClass: "instant",
		sideEffectLevel: "read-only",
		idempotent: true,
		idempotencyGuarantee: "idempotent-safe-retry",
		retryGuidance: "Safe to retry.",
		retryPolicyGuidance:
			"Retry immediately when I/O read fails transiently; no mutation is performed.",
		failureClassTaxonomy: ["filesystem", "timeout", "unknown"],
		inputSchema: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
	},
	{
		name: "bookkit.list_mechanisms",
		description: "List mechanism slugs, titles, and MCP resource URIs.",
		safety: "read_only",
		expectedRuntime: "<1s",
		expectedRuntimeClass: "instant",
		sideEffectLevel: "read-only",
		idempotent: true,
		idempotencyGuarantee: "idempotent-safe-retry",
		retryGuidance: "Safe to retry.",
		retryPolicyGuidance:
			"Retry immediately for transient failures; use list_books/read_book if persistent data-shape issues occur.",
		failureClassTaxonomy: ["validation", "configuration", "timeout", "unknown"],
		inputSchema: {
			type: "object",
			properties: {
				section: {
					type: "string",
					enum: ["mechanisms"],
					description: "Optional. Currently only mechanisms are supported.",
				},
			},
			additionalProperties: false,
		},
	},
	{
		name: "bookkit.validate_book",
		description: "Run book validation and return structured command output.",
		safety: "read_only",
		expectedRuntime: "<=10m",
		expectedRuntimeClass: "long",
		sideEffectLevel: "local-read/compute",
		idempotent: true,
		idempotencyGuarantee: "idempotent-retry-after-remediation",
		retryGuidance:
			"Retry after fixing validation errors or transient command failures.",
		retryPolicyGuidance:
			"Retry only after remediating validation findings; for transient execution failures, use backoff and cap retries.",
		failureClassTaxonomy: [
			"validation",
			"configuration",
			"timeout",
			"transient-command",
			"unknown",
		],
		inputSchema: {
			type: "object",
			properties: {
				book: {
					type: "string",
					description:
						"Optional book slug. Defaults to the current endpoint book when omitted.",
				},
			},
			additionalProperties: false,
		},
	},
	{
		name: "bookkit.compile_book",
		description:
			"Compile book content into build output. Runs the CLI compile command for a given book.",
		safety: "mutating",
		rateLimit: {
			maxPerMinute: 10,
			guidance:
				"Compilation is CPU-intensive. Limit calls; run validate_book first.",
		},
		expectedRuntime: "<=2m",
		expectedRuntimeClass: "moderate",
		sideEffectLevel: "local-write",
		idempotent: true,
		idempotencyGuarantee: "idempotent-safe-retry",
		retryGuidance:
			"Safe to retry. Output is deterministic for unchanged content.",
		retryPolicyGuidance:
			"Retry on transient failures. If content hasn't changed, output will be identical.",
		failureClassTaxonomy: [
			"validation",
			"configuration",
			"timeout",
			"transient-command",
			"unknown",
		],
		inputSchema: {
			type: "object",
			properties: {
				book: {
					type: "string",
					description: "Optional book slug. Defaults to current endpoint book.",
				},
			},
			additionalProperties: false,
		},
	},
	{
		name: "bookkit.export_book",
		description: "Export compiled book output in GitBook-compatible format.",
		safety: "mutating",
		rateLimit: {
			maxPerMinute: 10,
			guidance: "Export writes to disk. Limit calls; run compile_book first.",
		},
		expectedRuntime: "<=1m",
		expectedRuntimeClass: "moderate",
		sideEffectLevel: "local-write",
		idempotent: true,
		idempotencyGuarantee: "idempotent-safe-retry",
		retryGuidance:
			"Safe to retry. Export output overwrites previous export for the same book.",
		retryPolicyGuidance:
			"Retry on transient failures. Re-run compile_book first if content changes between attempts.",
		failureClassTaxonomy: [
			"validation",
			"configuration",
			"filesystem",
			"timeout",
			"transient-command",
			"unknown",
		],
		inputSchema: {
			type: "object",
			properties: {
				book: {
					type: "string",
					description: "Optional book slug. Defaults to current endpoint book.",
				},
			},
			additionalProperties: false,
		},
	},
	{
		name: "bookkit.check_separation",
		description: "Run architecture-boundary checks for the workspace.",
		safety: "read_only",
		expectedRuntime: "<30s",
		expectedRuntimeClass: "moderate",
		sideEffectLevel: "local-read/compute",
		idempotent: true,
		idempotencyGuarantee: "idempotent-retry-after-remediation",
		retryGuidance: "Retry after resolving separation violations.",
		retryPolicyGuidance:
			"Retry after fixing reported separation violations; transient command failures can be retried with short backoff.",
		failureClassTaxonomy: [
			"validation",
			"configuration",
			"transient-command",
			"unknown",
		],
		inputSchema: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
	},
	{
		name: "bookkit.check_corpus",
		description:
			"Compare mechanisms across the corpus books (corpus.json): clusters of overlapping mechanisms, shared slugs whose contracts drifted, and stale rulings. Use before naming or editing a mechanism.",
		safety: "read_only",
		expectedRuntime: "<30s (semantic: first run downloads a ~520 MB model)",
		expectedRuntimeClass: "moderate",
		sideEffectLevel: "local-read/compute",
		idempotent: true,
		idempotencyGuarantee: "idempotent-safe-retry",
		retryGuidance:
			"Safe to retry; pass semantic: false if the model cannot load.",
		retryPolicyGuidance:
			"Retry once on transient command failure; repeat with semantic: false when the embedding model is unavailable.",
		failureClassTaxonomy: [
			"validation",
			"configuration",
			"timeout",
			"transient-command",
			"unknown",
		],
		inputSchema: {
			type: "object",
			properties: {
				semantic: {
					type: "boolean",
					description:
						"Compare meaning with the local embedding model as well as wording. Default false (wording only, fast).",
				},
			},
			additionalProperties: false,
		},
	},
	{
		name: "bookkit.find_similar_mechanisms",
		description:
			"Before coining a mechanism, list existing ones in any book that share its wording, and whether its slug already exists. Bind an existing slug when one fits.",
		safety: "read_only",
		expectedRuntime: "<5s",
		expectedRuntimeClass: "short",
		sideEffectLevel: "read-only",
		idempotent: true,
		idempotencyGuarantee: "idempotent-safe-retry",
		retryGuidance: "Safe to retry.",
		retryPolicyGuidance:
			"Retry immediately for transient command failures; repeated retries are safe.",
		failureClassTaxonomy: ["validation", "transient-command", "unknown"],
		inputSchema: {
			type: "object",
			properties: {
				title: {
					type: "string",
					description: "Proposed mechanism title.",
				},
				definition: {
					type: "string",
					description:
						"Optional one-sentence definition; its words join the comparison.",
				},
			},
			required: ["title"],
			additionalProperties: false,
		},
	},
];
