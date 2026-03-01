import { DEFAULT_RESOURCE_PREFIX } from "../types";
import { buildResourceUri, normalizeModuleSlug, resolveResourceTitle } from "../resource-utils";
import type { ToolHandler } from "./types";

export const handleListMechanisms: ToolHandler = ({ options, args }) => {
  const section = args?.section;
  if (section && section !== "mechanisms") {
    return {
      ok: false,
      summary: "Unsupported list_mechanisms section.",
      error: {
        cause: `Received section=${JSON.stringify(section)}; only mechanisms are currently supported.`,
        nextAction: "Remove arguments.section or set it to \"mechanisms\".",
      },
    };
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
    ok: true,
    summary: `Listed ${mechanisms.length} mechanisms.`,
    payload: { bookTitle: options.bookTitle, mechanisms, count: mechanisms.length },
  };
};
