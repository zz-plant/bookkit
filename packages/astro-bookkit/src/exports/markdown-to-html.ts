import { createSlugger, stripMarkdown } from "../utils/markdown";

export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const renderInline = (value: string) => {
  const escaped = escapeHtml(value);
  return escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
};

export const markdownToHtml = (body: string, chapterSlugs?: string[]) => {
  const lines = body.split("\n");
  const slugger = createSlugger();
  const output: string[] = [];
  let listBuffer: string[] = [];
  let paragraphBuffer: string[] = [];

  const flushParagraph = () => {
    if (!paragraphBuffer.length) return;
    output.push(`<p>${renderInline(paragraphBuffer.join(" ").trim())}</p>`);
    paragraphBuffer = [];
  };

  const flushList = () => {
    if (!listBuffer.length) return;
    output.push(`<ul>${listBuffer.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ul>`);
    listBuffer = [];
  };

  const rewriteLinks = (html: string) => {
    if (!chapterSlugs?.length) return html;
    return html.replace(/href=\"\/?read\/chapters\/([^\"#]+)(#[^\"]+)?\"/g, (match, slug, hash) => {
      if (!chapterSlugs.includes(slug)) return match;
      return `href=\"chapters/${slug}.xhtml${hash ?? ""}\"`;
    });
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const text = headingMatch[2].replace(/#+\s*$/, "");
      output.push(`<h${headingMatch[1].length} id="${slugger(stripMarkdown(text))}">${renderInline(text)}</h${headingMatch[1].length}>`);
      continue;
    }

    const listMatch = trimmed.match(/^[-*+]\s+(.*)$/);
    if (listMatch) {
      flushParagraph();
      listBuffer.push(listMatch[1]);
      continue;
    }

    paragraphBuffer.push(trimmed);
  }

  flushParagraph();
  flushList();
  return rewriteLinks(output.join("\n"));
};
