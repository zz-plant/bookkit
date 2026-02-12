import { describe, expect, it } from "bun:test";

import { createLatestSectionChangeMap, createReleaseNotes } from "./notes";

describe("release note section change mapping", () => {
  it("normalizes changed sections and resolves latest section changes", () => {
    const releases = createReleaseNotes({
      "src/content/book/releases/2024-09-15.mdx": {
        frontmatter: {
          title: "Toolkit refresh",
          version: "0.2.0",
          date: "2024-09-15",
          summary: "Summary",
          highlights: ["one"],
          changedSections: ["toolkit", "mechanisms", "invalid_section"],
        },
      },
      "src/content/book/releases/2024-08-22.mdx": {
        frontmatter: {
          title: "Initial",
          version: "0.1.0",
          date: "2024-08-22",
          summary: "Summary",
          highlights: ["one"],
          changedSections: ["overview", "chapters", "toolkit"],
        },
      },
    });

    expect(releases[0].changedSections).toEqual(["toolkit", "mechanisms"]);

    const latestBySection = createLatestSectionChangeMap(releases);
    expect(latestBySection.toolkit.version).toBe("0.2.0");
    expect(latestBySection.chapters.version).toBe("0.1.0");
  });
});
