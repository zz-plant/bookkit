import type { BookContentRawModules } from "../book/entrypoints";
import { CONTENT_TYPES, type ContentTypeKey, type McpResourceInput, type ResourceListParams, type ResourceReadParams } from "./types";

const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---/;
const FRONTMATTER_LINE_PATTERN = /^([A-Za-z0-9_-]+)\s*:\s*(.+)$/;

export const extractFrontmatterField = (raw: string, field: string): string | null => {
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

export const resolveResourceTitle = (raw: string, fallback: string): string => {
  return extractFrontmatterField(raw, "title") || extractFrontmatterField(raw, "name") || extractFrontmatterField(raw, "term") || fallback;
};

export const normalizeModuleSlug = (moduleKey: string, type: string): string => {
  const normalized = moduleKey.replace(/\\/g, "/");
  const marker = `/${type}/`;
  const index = normalized.lastIndexOf(marker);
  const trimmed = index >= 0 ? normalized.slice(index + marker.length) : normalized;
  return trimmed.replace(/\.(mdx|md)$/, "");
};

export const buildResourceUri = (prefix: string, type: string, slug: string): string => {
  const safePrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
  return `${safePrefix}${type}/${slug}`;
};

export const parseResourceUri = (prefix: string, uri: string): { type: ContentTypeKey; slug: string } | null => {
  const safePrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
  if (!uri.startsWith(safePrefix)) return null;
  const path = uri.slice(safePrefix.length);
  const [type, ...rest] = path.split("/");
  if (!type || rest.length === 0) return null;
  if (!CONTENT_TYPES.includes(type as ContentTypeKey)) return null;
  return { type: type as ContentTypeKey, slug: rest.join("/") };
};

export const listResources = (
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

export const listPagedResources = (
  resources: ReturnType<typeof listResources>,
  params: ResourceListParams = {},
): { resources: ReturnType<typeof listResources>; nextCursor: string | null } => {
  const filtered = resources.filter((resource) => {
    if (params.kind && resource.kind !== params.kind) return false;
    if (params.section && resource.section !== params.section) return false;
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

export const readResource = (
  contentRawModules: BookContentRawModules,
  resourcePrefix: string,
  uri: string,
  governanceResources: McpResourceInput[] = [],
) => {
  const governanceMatch = governanceResources.find((resource) => resource.uri === uri);
  if (governanceMatch) {
    return { mimeType: governanceMatch.mimeType ?? "text/markdown", text: governanceMatch.text };
  }

  const parsed = parseResourceUri(resourcePrefix, uri);
  if (!parsed) return null;
  const modules = contentRawModules[parsed.type];
  const match = Object.entries(modules).find(([moduleKey]) => normalizeModuleSlug(moduleKey, parsed.type) === parsed.slug);
  if (!match) return null;
  return { mimeType: "text/markdown", text: match[1] };
};

export const buildResourceChunk = (uri: string, text: string, params: ResourceReadParams) => {
  const lines = text.split("\n");
  const totalLines = lines.length;
  const startRaw = typeof params.startLine === "number" ? Math.floor(params.startLine) : 1;
  const endRaw = typeof params.endLine === "number" ? Math.floor(params.endLine) : totalLines;
  const startLine = Math.min(Math.max(startRaw, 1), totalLines || 1);
  const endLine = Math.min(Math.max(endRaw, startLine), totalLines || startLine);
  return {
    text: lines.slice(startLine - 1, endLine).join("\n"),
    startLine,
    endLine,
    totalLines,
    chunkId: `${uri}#L${startLine}-L${endLine}`,
  };
};
