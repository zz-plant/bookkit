import { describe, expect, it } from "bun:test";

import { createBookMcpEndpoint } from "./endpoint";

const createFixtureEndpoint = () => {
  return createBookMcpEndpoint({
    bookTitle: "Fixture Book",
    contentRawModules: {
      chapters: {
        "src/content/book/chapters/00-overview.mdx": [
          "---",
          "title: Overview",
          "---",
          "# Intro",
          "Intro body",
          "## Details",
          "Details body",
        ].join("\n"),
      },
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
      {
        uri: "bookkit://governance/.codex/skills/content-edit/SKILL.md",
        name: "content-edit",
        text: "# content-edit skill\n\nUse this skill.",
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
      result: { content: Array<{ json: { ok: boolean; payload: { mechanisms: Array<{ slug: string }> } } }> };
    };

    expect(body.result.content[0].json.payload.mechanisms[0].slug).toBe("sample");
  });

  it("lists tool metadata in tools/list", async () => {
    const endpoint = createFixtureEndpoint();
    const response = await endpoint.POST({
      request: new Request("http://localhost/api/mcp.json", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/list" }),
      }),
    });

    const body = (await response.json()) as {
      result: {
        tools: Array<{ name: string; sideEffectLevel: string; expectedRuntime: string; retryGuidance: string }>;
      };
    };

    const listBooks = body.result.tools.find((tool) => tool.name === "bookkit.list_books");
    expect(listBooks?.sideEffectLevel).toBe("read-only");
    expect(listBooks?.expectedRuntime).toBe("<10s");
    expect(listBooks?.retryGuidance).toContain("retry");
  });

  it("supports resources/list pagination and filtering", async () => {
    const endpoint = createFixtureEndpoint();
    const response = await endpoint.POST({
      request: new Request("http://localhost/api/mcp.json", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 4,
          method: "resources/list",
          params: { kind: "content", limit: 1, cursor: "0" },
        }),
      }),
    });

    const body = (await response.json()) as {
      result: { resources: Array<{ kind: string }>; nextCursor: string | null };
    };

    expect(body.result.resources.length).toBe(1);
    expect(body.result.resources[0].kind).toBe("content");
    expect(body.result.nextCursor).toBe("1");
  });

  it("returns actionable tool payload when validate_book is missing book context", async () => {
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
          id: 5,
          method: "tools/call",
          params: { name: "bookkit.validate_book", arguments: {} },
        }),
      }),
    });

    const body = (await response.json()) as {
      result: { content: Array<{ json: { ok: boolean; error: { cause: string; nextAction: string } } }> };
    };
    expect(body.result.content[0].json.ok).toBe(false);
    expect(body.result.content[0].json.error.cause).toContain("arguments.book");
    expect(body.result.content[0].json.error.nextAction).toContain("Provide a book slug");
  });

  it("supports citation-ready ranged reads with stable chunk metadata", async () => {
    const endpoint = createFixtureEndpoint();
    const response = await endpoint.POST({
      request: new Request("http://localhost/api/mcp.json", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 6,
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

  it("supports section-based resource reads with stable section chunk IDs", async () => {
    const endpoint = createFixtureEndpoint();
    const response = await endpoint.POST({
      request: new Request("http://localhost/api/mcp.json", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 61,
          method: "resources/read",
          params: { uri: "bookkit://content/chapters/00-overview", section: "intro" },
        }),
      }),
    });

    const body = (await response.json()) as {
      result: {
        contents: Array<{ text: string; metadata: { chunkId: string; startLine: number; endLine: number } }>;
      };
    };

    expect(body.result.contents[0].text).toContain("# Intro");
    expect(body.result.contents[0].text).toContain("## Details");
    expect(body.result.contents[0].metadata.chunkId).toBe("bookkit://content/chapters/00-overview#section:intro");
    expect(body.result.contents[0].metadata.startLine).toBe(4);
  });

  it("returns actionable invalid-params error for invalid ranges", async () => {
    const endpoint = createFixtureEndpoint();
    const response = await endpoint.POST({
      request: new Request("http://localhost/api/mcp.json", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 62,
          method: "resources/read",
          params: { uri: "bookkit://content/chapters/00-overview", startLine: 8, endLine: 9 },
        }),
      }),
    });

    const body = (await response.json()) as { error: { code: number; message: string } };
    expect(body.error.code).toBe(-32602);
    expect(body.error.message).toContain("exceeds total lines");
    expect(body.error.message).toContain("retry within bounds");
  });


  it("lists local skills through bookkit.list_skills", async () => {
    const endpoint = createFixtureEndpoint();
    const response = await endpoint.POST({
      request: new Request("http://localhost/api/mcp.json", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 7,
          method: "tools/call",
          params: { name: "bookkit.list_skills", arguments: {} },
        }),
      }),
    });

    const body = (await response.json()) as {
      result: { content: Array<{ json: { ok: boolean; payload: { skills: Array<{ slug: string }> } } }> };
    };

    expect(body.result.content[0].json.payload.skills[0].slug).toBe("content-edit");
  });


  it("returns method-not-found error for unknown tool names", async () => {
    const endpoint = createFixtureEndpoint();
    const response = await endpoint.POST({
      request: new Request("http://localhost/api/mcp.json", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 8,
          method: "tools/call",
          params: { name: "bookkit.unknown_tool", arguments: {} },
        }),
      }),
    });

    const body = (await response.json()) as { error: { code: number; message: string } };
    expect(body.error.code).toBe(-32601);
    expect(body.error.message).toContain("Unknown tool");
  });

  it("publishes agent profile in GET discovery", async () => {
    const endpoint = createFixtureEndpoint();
    const response = endpoint.GET();
    const body = (await response.json()) as {
      agentProfile: { recommendedQueryOrder: string[]; resources: { supportsListPagination: boolean } };
      tools: string[];
    };

    expect(body.agentProfile.recommendedQueryOrder[0]).toBe("bookkit://governance/AGENTS.md");
    expect(body.agentProfile.recommendedQueryOrder).toContain("bookkit://governance/.codex/skills/README.md");
    expect(body.tools).toContain("bookkit.list_skills");
    expect(body.agentProfile.resources.supportsListPagination).toBe(true);
  });
});
