import { createSlugger, stripMarkdown } from "../utils/markdown";

export type SearchContentSource = {
  type: string;
  label: string;
  urlPrefix: string;
  titleKey: string;
  modules: Record<string, string>;
  slugFromPath?: (path: string) => string | null;
};

export type SearchEntry = {
  id: string;
  type: string;
  label: string;
  title: string;
  snippet: string;
  url: string;
  context: string;
};

const frontmatterPattern = /^---\n([\s\S]*?)\n---/;

const parseFrontmatter = (raw: string) => {
  const match = raw.match(frontmatterPattern);
  if (!match) return { data: {}, body: raw };
  const data: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const lineMatch = trimmed.match(/^(\w+):\s*(.*)$/);
    if (!lineMatch) continue;
    const key = lineMatch[1];
    let value = lineMatch[2].trim();
    value = value.replace(/^['"]|['"]$/g, "");
    data[key] = value;
  }
  const body = raw.slice(match[0].length).trim();
  return { data, body };
};

const summarize = (value: string, maxLength = 160) => {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trim()}…`;
};

const buildSections = (body: string) => {
  const lines = body.split("\n");
  const sections: Array<{ heading: string; body: string[] }> = [];
  let current: { heading: string; body: string[] } | null = null;

  for (const line of lines) {
    const headingMatch = line.match(/^(#{2,3})\s+(.*)$/);
    if (headingMatch) {
      if (current) sections.push(current);
      const headingText = stripMarkdown(headingMatch[2].replace(/#+\s*$/, "")).trim();
      current = { heading: headingText, body: [] };
      continue;
    }
    if (current) current.body.push(line);
  }
  if (current) sections.push(current);
  return sections;
};

const extractSnippet = (lines: string[]) => {
  const text = lines
    .map((line) => stripMarkdown(line))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return summarize(text || "No summary available.");
};

const defaultSlugFromPath = (path: string, type: string) => {
  if (type === "examples") {
    return path.split("/examples/")[1]?.replace(/\.mdx?$/, "") ?? null;
  }
  return path.split("/").pop()?.replace(/\.mdx?$/, "") ?? null;
};

export const buildSearchEntries = async (
  sources: SearchContentSource[]
): Promise<SearchEntry[]> => {
  const entries: SearchEntry[] = [];

  for (const source of sources) {
    for (const [path, raw] of Object.entries(source.modules)) {
      const { data, body } = parseFrontmatter(raw);
      const slug =
        data.slug ||
        (source.slugFromPath ? source.slugFromPath(path) : defaultSlugFromPath(path, source.type));
      if (!slug) continue;
      const title = data[source.titleKey] || data.title || slug;
      const slugger = createSlugger();
      const sections = buildSections(body);
      const sectionEntries = sections.map((section) => {
        const heading = section.heading || title;
        const anchor = slugger(heading);
        const snippet = extractSnippet(section.body);
        return { heading, anchor, snippet };
      });

      const baseSnippet = extractSnippet(body.split("\n").slice(0, 6));
      const slugAnchor = slug.replaceAll("/", "-");
      const defaultAnchor = sectionEntries.length ? sectionEntries[0].anchor : slugAnchor;
      entries.push({
        id: `${source.type}-${slug}-intro`,
        type: source.type,
        label: source.label,
        title,
        snippet: baseSnippet,
        url: `${source.urlPrefix}${slug}${defaultAnchor ? `#${defaultAnchor}` : ""}`,
        context: title,
      });

      sectionEntries.forEach((section) => {
        entries.push({
          id: `${source.type}-${slug}-${section.anchor}`,
          type: source.type,
          label: source.label,
          title: section.heading,
          snippet: section.snippet,
          url: `${source.urlPrefix}${slug}#${section.anchor}`,
          context: title,
        });
      });
    }
  }

  return entries;
};

export const createSearchIndexResponse = async (sources: SearchContentSource[]) => {
  const entries = await buildSearchEntries(sources);
  return new Response(JSON.stringify({ entries }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
};
