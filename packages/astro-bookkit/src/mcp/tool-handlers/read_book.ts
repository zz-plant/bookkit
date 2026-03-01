import { CONTENT_TYPES, DEFAULT_RESOURCE_PREFIX, type ContentTypeKey } from "../types";
import { buildResourceUri, normalizeModuleSlug, resolveResourceTitle } from "../resource-utils";
import type { ToolHandler } from "./types";

export const handleReadBook: ToolHandler = ({ options, args }) => {
  const rawSection = args?.section;
  const section = typeof rawSection === "string" && rawSection.trim().length ? rawSection.trim() : null;
  if (section && !CONTENT_TYPES.includes(section as ContentTypeKey)) {
    return {
      ok: false,
      summary: "Unsupported read_book section.",
      error: {
        cause: `Received section=${JSON.stringify(section)} but supported sections are ${CONTENT_TYPES.join(", ")}.`,
        nextAction: "Set arguments.section to a supported section or omit it.",
      },
    };
  }

  const rawSlug = args?.slug;
  const slug = typeof rawSlug === "string" && rawSlug.trim().length ? rawSlug.trim() : null;

  const records = CONTENT_TYPES.flatMap((type) => {
    if (section && type !== section) return [];
    return Object.entries(options.contentRawModules[type]).map(([moduleKey, raw]) => {
      const normalizedSlug = normalizeModuleSlug(moduleKey, type);
      return {
        section: type,
        slug: normalizedSlug,
        title: resolveResourceTitle(raw, normalizedSlug),
        uri: buildResourceUri(options.resourcePrefix ?? DEFAULT_RESOURCE_PREFIX, type, normalizedSlug),
        text: raw,
      };
    });
  }).filter((entry) => !slug || entry.slug === slug);

  if (slug && records.length === 0) {
    return {
      ok: false,
      summary: `No content found for slug ${slug}.`,
      error: {
        cause: `No ${section ?? "content"} entry matched slug \"${slug}\" for ${options.bookTitle}.`,
        nextAction: "Call bookkit.list_content (and resources/list) to find valid sections/slugs, then retry.",
      },
    };
  }

  return {
    ok: true,
    summary: `Read ${records.length} content records from ${options.bookTitle}.`,
    payload: {
      bookTitle: options.bookTitle,
      filters: { section, slug },
      records,
      count: records.length,
    },
  };
};
