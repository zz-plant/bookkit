import { describe, expect, it } from "bun:test";

import { createBookMcpEndpoint } from "./endpoint";

const createFixtureEndpoint = () => {
  return createBookMcpEndpoint({
    bookTitle: "Fixture Book",
    contentRawModules: {
      chapters: { "src/content/book/chapters/00-overview.mdx": "---\ntitle: Overview\n---\n# Intro" },
      mechanisms: { "src/content/book/mechanisms/sample.mdx": "---\ntitle: Sample Mechanism\n---\nBody" },
      toolkit: {},
      glossary: {},
      examples: {},
    },
    governanceResources: [
      {
        uri: "bookkit://governance/README.md",
        name: "README",
        text: "# Test",
      },
    ],
  });
};

describe("createBookMcpEndpoint", () => {
  it("lists governance resources alongside content resources", async () => {
    const endpoint = createFixtureEndpoint();
    const response = await endpoint.POST({
      request: new Request("http://localhost/api/mcp.json", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "resources/list" }),
      }),
    });

    const body = (await response.json()) as { result: { resources: Array<{ uri: string }> } };
    const uris = body.result.resources.map((resource) => resource.uri);

    expect(uris).toContain("bookkit://governance/README.md");
    expect(uris).toContain("bookkit://content/chapters/00-overview");
  });

  it("supports read-only list_mechanisms tool", async () => {
    const endpoint = createFixtureEndpoint();
    const response = await endpoint.POST({
      request: new Request("http://localhost/api/mcp.json", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "bookkit.list_mechanisms", arguments: {} },
        }),
      }),
    });

    const body = (await response.json()) as {
      result: { content: Array<{ json: { mechanisms: Array<{ slug: string }> } }> };
    };

    expect(body.result.content[0].json.mechanisms[0].slug).toBe("sample");
  });
});
