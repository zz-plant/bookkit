import type { ExportChapter } from "./types";

const frontmatterPattern = /^---\n([\s\S]*?)\n---/;

export const parseFrontmatter = (raw: string) => {
  const match = raw.match(frontmatterPattern);
  if (!match) return { data: {}, body: raw };
  const data: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const lineMatch = trimmed.match(/^(\w+):\s*(.*)$/);
    if (!lineMatch) continue;
    const key = lineMatch[1];
    const value = lineMatch[2].trim().replace(/^["']|["']$/g, "");
    data[key] = value;
  }
  return { data, body: raw.slice(match[0].length).trim() };
};

export const buildExportChapters = (modules: Record<string, string>): ExportChapter[] => {
  return Object.entries(modules)
    .sort(([pathA], [pathB]) => pathA.localeCompare(pathB))
    .map(([path, raw]) => {
      const { data, body } = parseFrontmatter(raw);
      const slug = data.slug ?? path.split("/").pop()?.replace(/\.mdx?$/, "") ?? "chapter";
      return {
        slug,
        title: data.title ?? slug,
        body,
        description: data.summary ?? data.description,
        locale: data.locale ?? undefined,
      };
    })
    .filter((chapter) => chapter.slug);
};
