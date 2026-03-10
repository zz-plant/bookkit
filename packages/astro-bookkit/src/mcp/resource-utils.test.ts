import { describe, expect, it } from "bun:test";

import { extractFrontmatterField, resolveResourceTitle } from "./resource-utils";

describe("resource-utils frontmatter parsing", () => {
  it("extracts title values containing colons", () => {
    const raw = "---\ntitle: \"Build: Ship Faster\"\n---\n# Body";

    expect(extractFrontmatterField(raw, "title")).toBe("Build: Ship Faster");
  });

  it("extracts multiline values", () => {
    const raw = "---\ntitle: |\n  Line one\n  Line two\n---\n# Body";

    expect(extractFrontmatterField(raw, "title")).toBe("Line one\nLine two");
  });

  it("extracts quoted and unquoted strings", () => {
    const quoted = "---\ntitle: \"Quoted title\"\n---\n# Body";
    const unquoted = "---\nname: Unquoted title\n---\n# Body";

    expect(extractFrontmatterField(quoted, "title")).toBe("Quoted title");
    expect(extractFrontmatterField(unquoted, "name")).toBe("Unquoted title");
  });

  it("falls back to slug when frontmatter is malformed", () => {
    const raw = "---\ntitle: [unterminated\n---\n# Body";

    expect(resolveResourceTitle(raw, "sample-slug")).toBe("sample-slug");
  });

  it("falls back to slug when candidate fields are non-string values", () => {
    const raw = "---\ntitle:\n  nested: value\nname:\n  - item\nterm: [a, b]\n---\n# Body";

    expect(resolveResourceTitle(raw, "sample-slug")).toBe("sample-slug");
  });
});
