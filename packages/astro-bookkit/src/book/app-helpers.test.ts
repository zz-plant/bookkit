import { describe, expect, it } from "bun:test";

import {
  createBookEntryPointsFromGlob,
  createChapterExportSlugs,
  createReleaseNoteHelpers,
} from "./app-helpers";

describe("book app helpers", () => {
  it("creates content and release entrypoints from a shared content root", () => {
    const globCalls: Array<{ pattern: string; options: Record<string, unknown> | undefined }> = [];

    const glob = <T = unknown>(
      pattern: string,
      options?: Record<string, unknown>
    ): Record<string, T> => {
      globCalls.push({ pattern, options });

      if (pattern.endsWith("chapters/*.mdx") && options?.query === "?raw") {
        return {
          "../content/book/chapters/one.mdx": "# Chapter one",
        } as Record<string, T>;
      }

      if (pattern.endsWith("chapters/*.mdx")) {
        return {
          "../content/book/chapters/one.mdx": {
            frontmatter: { slug: "chapter-one" },
          },
        } as Record<string, T>;
      }

      if (pattern.endsWith("releases/*.mdx")) {
        return {
          "../content/book/releases/2024-10-01.mdx": {
            frontmatter: {
              version: "0.2.0",
              title: "Release",
              date: "2024-10-01",
              summary: "Summary",
            },
          },
        } as Record<string, T>;
      }

      return {} as Record<string, T>;
    };

    const entryPoints = createBookEntryPointsFromGlob(glob);

    expect(Object.keys(entryPoints.contentModules.chapters)).toEqual([
      "../content/book/chapters/one.mdx",
    ]);
    expect(Object.keys(entryPoints.contentRawModules.chapters)).toEqual([
      "../content/book/chapters/one.mdx",
    ]);
    expect(Object.keys(entryPoints.releaseModules)).toEqual([
      "../content/book/releases/2024-10-01.mdx",
    ]);
    expect(globCalls.some((call) => call.pattern.endsWith("examples/**/*.mdx"))).toBe(true);
  });

  it("builds reusable release note and version helper functions", () => {
    const helpers = createReleaseNoteHelpers(
      {
        "../content/book/releases/2024-10-01.mdx": {
          frontmatter: {
            version: "0.2.0",
            title: "Release",
            date: "2024-10-01",
            summary: "Summary",
          },
        },
      },
      { latestLabel: "Current" }
    );

    const releaseNotes = helpers.getReleaseNotes();
    const versionEntries = helpers.getVersionEntries();

    expect(releaseNotes[0].version).toBe("0.2.0");
    expect(versionEntries[0].label).toBe("Current");
    expect(helpers.releaseModules).toBeTruthy();
  });

  it("extracts chapter export slugs from chapter modules", () => {
    expect(
      createChapterExportSlugs({
        "a.mdx": { frontmatter: { slug: "first" } },
        "b.mdx": { frontmatter: { slug: "" } },
        "c.mdx": {},
      })
    ).toEqual(["first"]);
  });
});
