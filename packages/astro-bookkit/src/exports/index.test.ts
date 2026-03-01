import { describe, expect, it } from "bun:test";

import { buildExportChapters } from "./content-parsing";
import { markdownToHtml } from "./markdown-to-html";

describe("exports modules", () => {
  it("buildExportChapters parses frontmatter and body", () => {
    const chapters = buildExportChapters({
      "src/content/book/chapters/01-intro.mdx": "---\ntitle: Intro\nsummary: Start here\nlocale: en\n---\n# Hello",
    });

    expect(chapters[0]).toEqual({
      slug: "01-intro",
      title: "Intro",
      description: "Start here",
      locale: "en",
      body: "# Hello",
    });
  });

  it("markdownToHtml renders headings/lists and rewrites chapter links", () => {
    const html = markdownToHtml("# Title\n- one\n\nSee [Next](/read/chapters/next)", ["next"]);
    expect(html).toContain('<h1 id="title">Title</h1>');
    expect(html).toContain("<ul><li>one</li></ul>");
    expect(html).toContain('href="chapters/next.xhtml"');
  });
});
