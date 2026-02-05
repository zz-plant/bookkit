import type { BookContentRawModules } from "../book/entrypoints";

type McpEndpointOptions = {
  bookTitle: string;
  bookDescription?: string;
  contentRawModules: BookContentRawModules;
  resourcePrefix?: string;
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

type ContentTypeKey = keyof BookContentRawModules;

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
) => {
  const resources = CONTENT_TYPES.flatMap((type) => {
    return Object.entries(contentRawModules[type]).map(([moduleKey, raw]) => {
      const slug = normalizeModuleSlug(moduleKey, type);
      const title = resolveResourceTitle(raw, slug);
      return {
        uri: buildResourceUri(resourcePrefix, type, slug),
        name: title,
        description: `${type} entry`,
        mimeType: "text/markdown",
      };
    });
  });
  return resources;
};

const readResource = (
  contentRawModules: BookContentRawModules,
  resourcePrefix: string,
  uri: string,
) => {
  const parsed = parseResourceUri(resourcePrefix, uri);
  if (!parsed) return null;
  const { type, slug } = parsed;
  const modules = contentRawModules[type];
  const match = Object.entries(modules).find(([moduleKey]) => {
    return normalizeModuleSlug(moduleKey, type) === slug;
  });
  if (!match) return null;
  return match[1];
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
            resources: {},
            tools: {},
          },
        },
      };
    case "resources/list":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          resources: listResources(options.contentRawModules, options.resourcePrefix ?? DEFAULT_RESOURCE_PREFIX),
          nextCursor: null,
        },
      };
    case "resources/read": {
      const params = request.params as { uri?: string } | undefined;
      const uri = params?.uri;
      if (!uri) return createJsonRpcError(id, -32602, "Missing resource URI.");
      const resource = readResource(
        options.contentRawModules,
        options.resourcePrefix ?? DEFAULT_RESOURCE_PREFIX,
        uri,
      );
      if (!resource) return createJsonRpcError(id, -32602, "Resource not found.");
      return {
        jsonrpc: "2.0",
        id,
        result: {
          contents: [
            {
              uri,
              mimeType: "text/markdown",
              text: resource,
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
          tools: [],
        },
      };
    case "tools/call":
      return createJsonRpcError(id, -32601, "No tools are available.");
    default:
      return createJsonRpcError(id, -32601, "Method not found.");
  }
};

export const createBookMcpEndpoint = (options: McpEndpointOptions) => {
  const resourcePrefix = options.resourcePrefix ?? DEFAULT_RESOURCE_PREFIX;

  return {
    GET: () => {
      const resources = listResources(options.contentRawModules, resourcePrefix);
      return createJsonResponse({
        ok: true,
        bookTitle: options.bookTitle,
        description: options.bookDescription ?? null,
        resourceCount: resources.length,
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
