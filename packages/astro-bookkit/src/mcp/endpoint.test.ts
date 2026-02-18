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

  it("supports read_book for section + slug filtering", async () => {
    const endpoint = createFixtureEndpoint();
    const response = await endpoint.POST({
      request: new Request("http://localhost/api/mcp.json", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 10,
          method: "tools/call",
          params: {
            name: "bookkit.read_book",
            arguments: { section: "chapters", slug: "00-overview" },
          },
        }),
      }),
    });

    const body = (await response.json()) as {
      result: {
        content: Array<{
          json: { ok: boolean; payload: { count: number; records: Array<{ slug: string; section: string }> } };
        }>;
      };
    };

    expect(body.result.content[0].json.ok).toBe(true);
    expect(body.result.content[0].json.payload.count).toBe(1);
    expect(body.result.content[0].json.payload.records[0].slug).toBe("00-overview");
    expect(body.result.content[0].json.payload.records[0].section).toBe("chapters");
  });

  it("returns actionable error when create_book is called without a slug", async () => {
    const endpoint = createFixtureEndpoint();
    const response = await endpoint.POST({
      request: new Request("http://localhost/api/mcp.json", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 11,
          method: "tools/call",
          params: { name: "bookkit.create_book", arguments: {} },
        }),
      }),
    });

    const body = (await response.json()) as {
      result: {
        content: Array<{
          json: { ok: boolean; error: { cause: string; nextAction: string } };
        }>;
      };
    };

    expect(body.result.content[0].json.ok).toBe(false);
    expect(body.result.content[0].json.error.cause).toContain("arguments.book");
    expect(body.result.content[0].json.error.nextAction).toContain("bookkit.create_book");
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

    const createBook = body.result.tools.find((tool) => tool.name === "bookkit.create_book");
    expect(createBook?.sideEffectLevel).toBe("local-write");
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

  it("returns actionable guidance for unknown resource URIs", async () => {
    const endpoint = createFixtureEndpoint();
    const response = await endpoint.POST({
      request: new Request("http://localhost/api/mcp.json", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 9,
          method: "resources/read",
          params: { uri: "bookkit://content/chapters/missing" },
        }),
      }),
    });

    const body = (await response.json()) as { error: { code: number; message: string } };
    expect(body.error.code).toBe(-32602);
    expect(body.error.message).toContain("Call resources/list");
  });

  it("publishes agent profile in GET discovery", async () => {
    const endpoint = createFixtureEndpoint();
    const response = endpoint.GET();
    const body = (await response.json()) as {
      agentProfile: { recommendedQueryOrder: string[]; resources: { supportsListPagination: boolean } };
      tools: string[];
      resourceKinds: string[];
      resourceSections: string[];
      rateLimits: { requestsPerMinute: number; burst: number };
    };

    expect(body.agentProfile.recommendedQueryOrder[0]).toBe("bookkit://governance/AGENTS.md");
    expect(body.agentProfile.recommendedQueryOrder).toContain("bookkit://governance/.codex/skills/README.md");
    expect(body.tools).toContain("bookkit.list_skills");
    expect(body.tools).toContain("bookkit.read_book");
    expect(body.agentProfile.resources.supportsListPagination).toBe(true);
    expect(body.resourceKinds).toContain("content");
    expect(body.resourceKinds).toContain("governance");
    expect(body.resourceSections).toContain("chapters");
    expect(body.rateLimits.requestsPerMinute).toBe(120);
    expect(body.rateLimits.burst).toBe(30);
  });
});
