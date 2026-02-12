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

  it("lists P0 toolset in tools/list", async () => {
    const endpoint = createFixtureEndpoint();
    const response = await endpoint.POST({
      request: new Request("http://localhost/api/mcp.json", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/list" }),
      }),
    });

    const body = (await response.json()) as { result: { tools: Array<{ name: string }> } };
    const names = body.result.tools.map((tool) => tool.name);

    expect(names).toContain("bookkit.list_books");
    expect(names).toContain("bookkit.validate_book");
    expect(names).toContain("bookkit.check_separation");
  });

  it("returns actionable invalid params when validate_book is missing book context", async () => {
    const endpoint = createBookMcpEndpoint({
      bookTitle: "No Slug",
      contentRawModules: {
        chapters: {},
        mechanisms: {},
        toolkit: {},
        glossary: {},
        examples: {},
      },
    });

    const response = await endpoint.POST({
      request: new Request("http://localhost/api/mcp.json", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: { name: "bookkit.validate_book", arguments: {} },
        }),
      }),
    });

    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toContain("arguments.book");
  });


  it("supports citation-ready ranged reads with stable chunk metadata", async () => {
    const endpoint = createFixtureEndpoint();
    const response = await endpoint.POST({
      request: new Request("http://localhost/api/mcp.json", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 5,
          method: "resources/read",
          params: { uri: "bookkit://content/chapters/00-overview", startLine: 1, endLine: 3 },
        }),
      }),
    });

    const body = (await response.json()) as {
      result: {
        contents: Array<{
          text: string;
          metadata: { chunkId: string; startLine: number; endLine: number; totalLines: number };
        }>;
      };
    };

    expect(body.result.contents[0].text).toContain("title: Overview");
    expect(body.result.contents[0].metadata.chunkId).toBe("bookkit://content/chapters/00-overview#L1-L3");
    expect(body.result.contents[0].metadata.totalLines).toBeGreaterThanOrEqual(3);
  });

});
