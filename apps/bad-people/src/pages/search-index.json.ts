const contentSources = [
  {
    type: "chapters",
    label: "Chapters",
    path: "../content/book/chapters/*.mdx",
    urlPrefix: "/read/chapters/",
    titleKey: "title",
  },
  {
    type: "mechanisms",
    label: "Mechanisms",
    path: "../content/book/mechanisms/*.mdx",
    urlPrefix: "/read/mechanisms/",
    titleKey: "title",
  },
  {
    type: "toolkit",
    label: "Toolkit",
    path: "../content/book/toolkit/*.mdx",
    urlPrefix: "/read/toolkit/",
    titleKey: "name",
  },
  {
    type: "glossary",
    label: "Glossary",
    path: "../content/book/glossary/*.mdx",
    urlPrefix: "/read/glossary/",
    titleKey: "term",
  },
  {
    type: "examples",
    label: "Examples",
    path: "../content/book/examples/**/*.mdx",
    urlPrefix: "/read/examples/",
    titleKey: "title",
  },
];

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

const createSlugger = () => {
  const used = new Map<string, number>();
  return (value: string) => {
    const base = value
      .toLowerCase()
      .trim()
      .replace(/[`~!@#$%^&*()=+\[{\]}\\|;:'",.<>/?]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-/g, "")
      .replace(/-$/g, "");
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    if (!base) return "section";
    return count ? `${base}-${count}` : base;
  };
};

const stripMarkdown = (value: string) => {
  return value
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .replace(/\[(.*?)\]\([^)]*\)/g, "$1")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/_{1,3}(.*?)_{1,3}/g, "$1")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/^\s*[-*+]\s+/g, "")
    .replace(/^\s*\d+\.\s+/g, "")
    .trim();
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

const buildEntries = async () => {
  const entries: Array<{
    id: string;
    type: string;
    label: string;
    title: string;
    snippet: string;
    url: string;
    context: string;
  }> = [];

  for (const source of contentSources) {
    const modules = import.meta.glob<string>(source.path, { eager: true, as: "raw" });
    for (const [path, raw] of Object.entries(modules)) {
      const { data, body } = parseFrontmatter(raw);
      const slug =
        data.slug ||
        (source.type === "examples"
          ? path.split("/examples/")[1]?.replace(/\.mdx?$/, "")
          : path.split("/").pop()?.replace(/\.mdx?$/, ""));
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

export async function GET() {
  const entries = await buildEntries();
  return new Response(JSON.stringify({ entries }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
