import { CONTENT_TYPES } from "./types";

export const TOOL_DEFINITIONS = [
  {
    name: "bookkit.create_book",
    description: "Scaffold a new book app in apps/<book> using the workspace template command.",
    expectedRuntime: "<=30s",
    sideEffectLevel: "local-write",
    idempotent: false,
    retryGuidance: "Do not blindly retry. If creation fails, inspect stderr and remove partial output before rerunning.",
    inputSchema: {
      type: "object",
      properties: {
        book: { type: "string", description: "Required slug for the new book (for example, running-hot)." },
        title: { type: "string", description: "Optional display title for the generated book config." },
        template: { type: "string", description: "Optional template book slug to copy from. Defaults to running-hot." },
      },
      required: ["book"],
      additionalProperties: false,
    },
  },
  {
    name: "bookkit.read_book",
    description: "Read current book content records by section and optional slug.",
    expectedRuntime: "<1s",
    sideEffectLevel: "read-only",
    idempotent: true,
    retryGuidance: "Safe to retry.",
    inputSchema: {
      type: "object",
      properties: {
        section: { type: "string", enum: CONTENT_TYPES, description: "Optional content section filter." },
        slug: { type: "string", description: "Optional slug filter inside the selected section." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "bookkit.list_books",
    description: "List available book slugs in this workspace.",
    expectedRuntime: "<10s",
    sideEffectLevel: "read-only",
    idempotent: true,
    retryGuidance: "Safe to retry on timeout or transient command errors.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "bookkit.list_content",
    description: "List available content section counts for this book.",
    expectedRuntime: "<1s",
    sideEffectLevel: "read-only",
    idempotent: true,
    retryGuidance: "Safe to retry.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "bookkit.list_skills",
    description: "List local agent skills that can guide contribution workflows.",
    expectedRuntime: "<1s",
    sideEffectLevel: "read-only",
    idempotent: true,
    retryGuidance: "Safe to retry.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "bookkit.list_mechanisms",
    description: "List mechanism slugs, titles, and MCP resource URIs.",
    expectedRuntime: "<1s",
    sideEffectLevel: "read-only",
    idempotent: true,
    retryGuidance: "Safe to retry.",
    inputSchema: {
      type: "object",
      properties: {
        section: { type: "string", enum: ["mechanisms"], description: "Optional. Currently only mechanisms are supported." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "bookkit.validate_book",
    description: "Run book validation and return structured command output.",
    expectedRuntime: "<=10m",
    sideEffectLevel: "local-read/compute",
    idempotent: true,
    retryGuidance: "Retry after fixing validation errors or transient command failures.",
    inputSchema: {
      type: "object",
      properties: { book: { type: "string", description: "Optional book slug. Defaults to the current endpoint book when omitted." } },
      additionalProperties: false,
    },
  },
  {
    name: "bookkit.check_separation",
    description: "Run architecture-boundary checks for the workspace.",
    expectedRuntime: "<30s",
    sideEffectLevel: "local-read/compute",
    idempotent: true,
    retryGuidance: "Retry after resolving separation violations.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
] as const;

export const TOOL_NAMES = TOOL_DEFINITIONS.map((tool) => tool.name);
export const TOOL_NAME_SET: ReadonlySet<string> = new Set(TOOL_NAMES);

export type ToolName = (typeof TOOL_DEFINITIONS)[number]["name"];

export const isToolName = (value: unknown): value is ToolName => typeof value === "string" && TOOL_NAME_SET.has(value);
