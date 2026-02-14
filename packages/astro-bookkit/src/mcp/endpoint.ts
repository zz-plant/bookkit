import type { BookContentRawModules } from "../book/entrypoints";
import { spawnSync } from "node:child_process";

type McpEndpointOptions = {
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

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: unknown;
};

type JsonRpcSuccess = {
  jsonrpc: "2.0";
  id?: number | string | null;
  result: unknown;
};

type JsonRpcError = {
  jsonrpc: "2.0";
  id?: number | string | null;
  error: {
    code: number;
    message: string;
  };
};

type ResourceReadParams = {
  uri?: string;
  startLine?: number;
  endLine?: number;
};

type ResourceListParams = {
  cursor?: string;
  limit?: number;
  kind?: "content" | "governance";
  section?: string;
};

type ContentTypeKey = keyof BookContentRawModules;
type ToolName =
  | "bookkit.list_books"
  | "bookkit.list_content"
  | "bookkit.list_skills"
  | "bookkit.list_mechanisms"
  | "bookkit.validate_book"
  | "bookkit.check_separation";

const DEFAULT_RESOURCE_PREFIX = "bookkit://content/";
const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---/;
const FRONTMATTER_LINE_PATTERN = /^([A-Za-z0-9_-]+)\s*:\s*(.+)$/;
const CONTENT_TYPES: ContentTypeKey[] = [
  "chapters",
  "mechanisms",
  "toolkit",
  "glossary",
  "examples",
];

const TOOL_DEFINITIONS = [
  {
    name: "bookkit.list_books",
    description: "List available book slugs in this workspace.",
    expectedRuntime: "<10s",
    sideEffectLevel: "read-only",
    idempotent: true,
    retryGuidance: "Safe to retry on timeout or transient command errors.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "bookkit.list_content",
    description: "List available content section counts for this book.",
    expectedRuntime: "<1s",
    sideEffectLevel: "read-only",
    idempotent: true,
    retryGuidance: "Safe to retry.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "bookkit.list_skills",
    description: "List local agent skills that can guide contribution workflows.",
    expectedRuntime: "<1s",
    sideEffectLevel: "read-only",
    idempotent: true,
    retryGuidance: "Safe to retry.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
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
    expectedRuntime: "<=10m",
    sideEffectLevel: "local-read/compute",
    idempotent: true,
    retryGuidance: "Retry after fixing validation errors or transient command failures.",
    inputSchema: {
      type: "object",
      properties: {
        book: {
          type: "string",
          description: "Optional book slug. Defaults to the current endpoint book when omitted.",
        },
      },
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
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
] as const;

const extractFrontmatterField = (raw: string, field: string): string | null => {
  const match = raw.match(FRONTMATTER_PATTERN);
  if (!match) return null;
  const lines = match[1].split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const lineMatch = trimmed.match(FRONTMATTER_LINE_PATTERN);
    if (!lineMatch) continue;
    if (lineMatch[1].toLowerCase() === field.toLowerCase()) {
      return lineMatch[2].replace(/^["']|["']$/g, "").trim();
    }
  }
  return null;
};

const resolveResourceTitle = (raw: string, fallback: string): string => {
  return (
    extractFrontmatterField(raw, "title") ||
    extractFrontmatterField(raw, "name") ||
    extractFrontmatterField(raw, "term") ||
    fallback
  );
};

const normalizeModuleSlug = (moduleKey: string, type: string): string => {
  const normalized = moduleKey.replace(/\\/g, "/");
  const marker = `/${type}/`;
  const index = normalized.lastIndexOf(marker);
  const trimmed = index >= 0 ? normalized.slice(index + marker.length) : normalized;
  return trimmed.replace(/\.(mdx|md)$/, "");
};

const buildResourceUri = (prefix: string, type: string, slug: string): string => {
  const safePrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
  return `${safePrefix}${type}/${slug}`;
};

const parseResourceUri = (
  prefix: string,
  uri: string,
): { type: ContentTypeKey; slug: string } | null => {
  const safePrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
  if (!uri.startsWith(safePrefix)) return null;
  const path = uri.slice(safePrefix.length);
  const [type, ...rest] = path.split("/");
  if (!type || rest.length === 0) return null;
  if (!CONTENT_TYPES.includes(type as ContentTypeKey)) return null;
  return { type: type as ContentTypeKey, slug: rest.join("/") };
};

const createJsonResponse = (payload: unknown, status = 200) => {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};

const createJsonRpcError = (
  id: JsonRpcError["id"],
  code: number,
  message: string,
): JsonRpcError => {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
    },
  };
};

const listResources = (
  contentRawModules: BookContentRawModules,
  resourcePrefix: string,
  governanceResources: McpResourceInput[] = [],
) => {
  const contentResources = CONTENT_TYPES.flatMap((type) => {
    return Object.entries(contentRawModules[type]).map(([moduleKey, raw]) => {
      const slug = normalizeModuleSlug(moduleKey, type);
      const title = resolveResourceTitle(raw, slug);
      return {
        uri: buildResourceUri(resourcePrefix, type, slug),
        name: title,
        description: `${type} entry`,
        mimeType: "text/markdown",
        kind: "content",
        section: type,
      };
    });
  });

  const governance = governanceResources.map((resource) => ({
    uri: resource.uri,
    name: resource.name,
    description: resource.description ?? "governance entry",
    mimeType: resource.mimeType ?? "text/markdown",
    kind: "governance",
    section: undefined,
  }));

  return [...contentResources, ...governance];
};


const listPagedResources = (
  resources: ReturnType<typeof listResources>,
  params: ResourceListParams = {},
): { resources: ReturnType<typeof listResources>; nextCursor: string | null } => {
  const kind = params.kind;
  const section = params.section;
  const filtered = resources.filter((resource) => {
    if (kind && resource.kind !== kind) return false;
    if (section && resource.section !== section) return false;
    return true;
  });

  const offset = Number.parseInt(params.cursor ?? "0", 10);
  const start = Number.isFinite(offset) && offset >= 0 ? offset : 0;
  const limitRaw = typeof params.limit === "number" ? Math.floor(params.limit) : 50;
  const limit = Math.max(1, Math.min(200, limitRaw));
  const page = filtered.slice(start, start + limit);
  const nextCursor = start + limit < filtered.length ? String(start + limit) : null;

  return { resources: page, nextCursor };
};

const readResource = (
  contentRawModules: BookContentRawModules,
  resourcePrefix: string,
  uri: string,
  governanceResources: McpResourceInput[] = [],
) => {
  const governanceMatch = governanceResources.find((resource) => resource.uri === uri);
  if (governanceMatch) {
    return {
      mimeType: governanceMatch.mimeType ?? "text/markdown",
      text: governanceMatch.text,
    };
  }

  const parsed = parseResourceUri(resourcePrefix, uri);
  if (!parsed) return null;
  const { type, slug } = parsed;
  const modules = contentRawModules[type];
  const match = Object.entries(modules).find(([moduleKey]) => {
    return normalizeModuleSlug(moduleKey, type) === slug;
  });
  if (!match) return null;
  return {
    mimeType: "text/markdown",
    text: match[1],
  };
};

type ResourceChunk = {
  text: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  chunkId: string;
};

const buildResourceChunk = (uri: string, text: string, params: ResourceReadParams): ResourceChunk => {
  const lines = text.split("\n");
  const totalLines = lines.length;
  const startRaw = typeof params.startLine === "number" ? Math.floor(params.startLine) : 1;
  const endRaw = typeof params.endLine === "number" ? Math.floor(params.endLine) : totalLines;
  const startLine = Math.min(Math.max(startRaw, 1), totalLines || 1);
  const endLine = Math.min(Math.max(endRaw, startLine), totalLines || startLine);
  const chunkText = lines.slice(startLine - 1, endLine).join("\n");
  return {
    text: chunkText,
    startLine,
    endLine,
    totalLines,
    chunkId: `${uri}#L${startLine}-L${endLine}`,
  };
};
const createInvalidParamsError = (id: JsonRpcError["id"], detail: string): JsonRpcError => {
  return createJsonRpcError(id, -32602, `Invalid params: ${detail}`);
};

const runWorkspaceCommand = (
  workspaceRoot: string | undefined,
  args: string[],
): { ok: boolean; command: string; stdout: string; stderr: string; exitCode: number } => {
  const cwd = workspaceRoot ?? process.cwd();
  const result = spawnSync("bun", args, {
    cwd,
    encoding: "utf8",
    timeout: 10 * 60 * 1000,
  });

  return {
    ok: result.status === 0,
    command: `bun ${args.join(" ")}`,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    exitCode: result.status ?? -1,
  };
};

const runTool = (
  options: McpEndpointOptions,
  name: ToolName,
  args: Record<string, unknown> | undefined,
): unknown => {
  if (name === "bookkit.list_books") {
    const command = runWorkspaceCommand(options.workspaceRoot, ["run", "list:books"]);
    if (!command.ok) {
      throw new Error(
        `list:books failed (exit ${command.exitCode}). ${command.stderr || command.stdout || "No output."}`,
      );
    }

    const books = command.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !line.startsWith("$ "));

    return {
      books,
      count: books.length,
      command: command.command,
    };
  }

  if (name === "bookkit.list_content") {
    const sections = CONTENT_TYPES.map((section) => ({
      section,
      count: Object.keys(options.contentRawModules[section]).length,
    }));

    return {
      bookTitle: options.bookTitle,
      sections,
      total: sections.reduce((sum, entry) => sum + entry.count, 0),
    };
  }

  if (name === "bookkit.list_skills") {
    const skills = (options.governanceResources ?? [])
      .filter((resource) => resource.uri.startsWith("bookkit://governance/.codex/skills/"))
      .map((resource) => {
        const slug = resource.uri
          .replace("bookkit://governance/.codex/skills/", "")
          .replace(/\/SKILL\.md$/, "")
          .replace("README.md", "README");
        const firstLine = resource.text
          .split("\n")
          .find((line) => line.trim().startsWith("#"))
          ?.replace(/^#+\s*/, "")
          .trim();

        return {
          slug,
          name: firstLine || slug,
          uri: resource.uri,
        };
      })
      .filter((skill) => skill.slug !== "README");

    return {
      skills,
      count: skills.length,
      guidance: "Read each skill URI for lane-specific checklists before making changes.",
    };
  }

  if (name === "bookkit.validate_book") {
    const rawBook = args?.book;
    const book = typeof rawBook === "string" && rawBook.trim().length ? rawBook.trim() : options.bookSlug;
    if (!book) {
      throw new Error("Provide a book slug in arguments.book.");
    }

    const command = runWorkspaceCommand(options.workspaceRoot, ["run", "validate:book", "--", "--book", book]);

    return {
      book,
      ok: command.ok,
      command: command.command,
      exitCode: command.exitCode,
      stdout: command.stdout.trim(),
      stderr: command.stderr.trim(),
      remediation: command.ok
        ? null
        : "Fix the reported validation errors, then re-run bun run validate:book -- --book <slug>.",
    };
  }

  if (name === "bookkit.check_separation") {
    const command = runWorkspaceCommand(options.workspaceRoot, ["run", "check:separation"]);

    return {
      ok: command.ok,
      command: command.command,
      exitCode: command.exitCode,
      stdout: command.stdout.trim(),
      stderr: command.stderr.trim(),
      remediation: command.ok
        ? null
        : "Resolve boundary violations, then re-run bun run check:separation.",
    };
  }

  const section = args?.section;
  if (section && section !== "mechanisms") {
    throw new Error("Only section=\"mechanisms\" is supported.");
  }

  const mechanisms = Object.entries(options.contentRawModules.mechanisms).map(([moduleKey, raw]) => {
    const slug = normalizeModuleSlug(moduleKey, "mechanisms");
    return {
      slug,
      title: resolveResourceTitle(raw, slug),
      uri: buildResourceUri(options.resourcePrefix ?? DEFAULT_RESOURCE_PREFIX, "mechanisms", slug),
    };
  });

  return {
    bookTitle: options.bookTitle,
    mechanisms,
    count: mechanisms.length,
  };
};

const handleRequest = (options: McpEndpointOptions, request: JsonRpcRequest): JsonRpcSuccess | JsonRpcError => {
  const id = request.id ?? null;

  switch (request.method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
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
            tools: {
              listChanged: false,
              metadata: true,
            },
          },
        },
      };
    case "resources/list": {
      const params = request.params as ResourceListParams | undefined;
      const listed = listResources(
        options.contentRawModules,
        options.resourcePrefix ?? DEFAULT_RESOURCE_PREFIX,
        options.governanceResources,
      );
      const paged = listPagedResources(listed, params);
      return {
        jsonrpc: "2.0",
        id,
        result: {
          resources: paged.resources,
          nextCursor: paged.nextCursor,
        },
      };
    }
    case "resources/read": {
      const params = request.params as ResourceReadParams | undefined;
      const uri = params?.uri;
      if (!uri) return createJsonRpcError(id, -32602, "Missing resource URI.");
      const resource = readResource(
        options.contentRawModules,
        options.resourcePrefix ?? DEFAULT_RESOURCE_PREFIX,
        uri,
        options.governanceResources,
      );
      if (!resource) return createJsonRpcError(id, -32602, "Resource not found.");
      const chunk = buildResourceChunk(uri, resource.text, params ?? {});
      return {
        jsonrpc: "2.0",
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
              },
            },
          ],
        },
      };
    }
    case "tools/list":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          tools: TOOL_DEFINITIONS,
        },
      };
    case "tools/call": {
      const params = request.params as
        | {
            name?: string;
            arguments?: Record<string, unknown>;
          }
        | undefined;

      const name = params?.name;
      if (!name) return createInvalidParamsError(id, "Missing tool name.");
      if (
        name !== "bookkit.list_books" &&
        name !== "bookkit.list_content" &&
        name !== "bookkit.list_skills" &&
        name !== "bookkit.list_mechanisms" &&
        name !== "bookkit.validate_book" &&
        name !== "bookkit.check_separation"
      ) {
        return createJsonRpcError(id, -32601, `Unknown tool: ${name}.`);
      }

      try {
        const result = runTool(options, name, params?.arguments);
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "json",
                json: result,
              },
            ],
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Tool execution failed.";
        return createInvalidParamsError(id, message);
      }
    }
    default:
      return createJsonRpcError(id, -32601, "Method not found.");
  }
};

export const createBookMcpEndpoint = (options: McpEndpointOptions) => {
  const resourcePrefix = options.resourcePrefix ?? DEFAULT_RESOURCE_PREFIX;

  return {
    GET: () => {
      const resources = listResources(options.contentRawModules, resourcePrefix, options.governanceResources);
      return createJsonResponse({
        ok: true,
        bookTitle: options.bookTitle,
        description: options.bookDescription ?? null,
        resourceCount: resources.length,
        resourceReadOptions: {
          supportsLineRanges: true,
          params: ["startLine", "endLine"],
        },
        tools: TOOL_DEFINITIONS.map((tool) => tool.name),
        toolMetadata: TOOL_DEFINITIONS,
        agentProfile: {
          safetyMode: "safe-first",
          mutatingTools: [],
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
      let payload: unknown = null;
      try {
        payload = await request.json();
      } catch (error) {
        return createJsonResponse(createJsonRpcError(null, -32700, "Invalid JSON payload."), 400);
      }

      if (!payload) {
        return createJsonResponse(createJsonRpcError(null, -32600, "Missing JSON-RPC payload."), 400);
      }

      if (Array.isArray(payload)) {
        const responses = payload
          .filter((item): item is JsonRpcRequest => Boolean(item))
          .map((item) => handleRequest(options, item));
        return createJsonResponse(responses);
      }

      const response = handleRequest(options, payload as JsonRpcRequest);
      return createJsonResponse(response);
    },
  };
};

export type { McpEndpointOptions };
