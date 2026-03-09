import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "bun:test";

import { createBookMcpEndpointFromWorkspace, findWorkspaceRoot } from "./workspace";

const temporaryDirectories: string[] = [];

const createTempDir = (): string => {
  const dirPath = mkdtempSync(join(tmpdir(), "bookkit-mcp-workspace-"));
  temporaryDirectories.push(dirPath);
  return dirPath;
};

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const dirPath = temporaryDirectories.pop();
    if (dirPath) {
      rmSync(dirPath, { recursive: true, force: true });
    }
  }
});

const createFixtureContentRawModules = () => ({
  chapters: {
    "src/content/book/chapters/00-overview.mdx": "---\ntitle: Overview\n---\n# Intro\nLine A\n## Deep Dive\nLine B",
  },
  mechanisms: {},
  toolkit: {},
  glossary: {},
  examples: {},
});

describe("findWorkspaceRoot", () => {
  it("discovers the nearest ancestor containing core governance files", () => {
    const workspaceRoot = createTempDir();
    const startDir = resolve(workspaceRoot, "apps/demo/src/pages/api");
    mkdirSync(startDir, { recursive: true });

    writeFileSync(resolve(workspaceRoot, "README.md"), "# README\n");
    writeFileSync(resolve(workspaceRoot, "CONTRIBUTING.md"), "# CONTRIBUTING\n");
    writeFileSync(resolve(workspaceRoot, "AGENTS.md"), "# AGENTS\n");
    writeFileSync(resolve(workspaceRoot, "package.json"), '{"name":"fixture","scripts":{}}');

    expect(findWorkspaceRoot(startDir)).toBe(workspaceRoot);
  });

  it("falls back to nearest package root when governance files are missing", () => {
    const packageRoot = createTempDir();
    const startDir = resolve(packageRoot, "apps/demo/src/pages/api");
    mkdirSync(startDir, { recursive: true });
    writeFileSync(resolve(packageRoot, "package.json"), '{"name":"fixture"}');

    expect(findWorkspaceRoot(startDir)).toBe(packageRoot);
  });
});

describe("createBookMcpEndpointFromWorkspace", () => {
  it("includes discovered governance resources in MCP resource listings", async () => {
    const workspaceRoot = createTempDir();
    const startDir = resolve(workspaceRoot, "apps/demo/src/pages/api");
    mkdirSync(startDir, { recursive: true });

    writeFileSync(resolve(workspaceRoot, "README.md"), "# README\n");
    writeFileSync(resolve(workspaceRoot, "CONTRIBUTING.md"), "# CONTRIBUTING\n");
    writeFileSync(resolve(workspaceRoot, "AGENTS.md"), "# AGENTS\n");
    writeFileSync(resolve(workspaceRoot, "package.json"), '{"name":"fixture","scripts":{}}');

    const endpoint = createBookMcpEndpointFromWorkspace({
      startDir,
      bookTitle: "Fixture",
      contentRawModules: createFixtureContentRawModules(),
    });

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
    expect(uris).toContain("bookkit://governance/CONTRIBUTING.md");
    expect(uris).toContain("bookkit://governance/AGENTS.md");
  });

  it("gracefully omits missing governance files", async () => {
    const packageRoot = createTempDir();
    const startDir = resolve(packageRoot, "apps/demo/src/pages/api");
    mkdirSync(startDir, { recursive: true });

    writeFileSync(resolve(packageRoot, "package.json"), '{"name":"fixture"}');
    writeFileSync(resolve(packageRoot, "README.md"), "# README\n");

    const endpoint = createBookMcpEndpointFromWorkspace({
      startDir,
      bookTitle: "Fixture",
      contentRawModules: createFixtureContentRawModules(),
    });

    const response = await endpoint.POST({
      request: new Request("http://localhost/api/mcp.json", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "resources/list" }),
      }),
    });

    const body = (await response.json()) as { result: { resources: Array<{ uri: string }> } };
    const uris = body.result.resources.map((resource) => resource.uri);

    expect(uris).toContain("bookkit://governance/README.md");
    expect(uris).not.toContain("bookkit://governance/CONTRIBUTING.md");
    expect(uris).not.toContain("bookkit://governance/AGENTS.md");
  });

  it("publishes chunking descriptors and supports section-indexed chunk reads", async () => {
    const workspaceRoot = createTempDir();
    const startDir = resolve(workspaceRoot, "apps/demo/src/pages/api");
    mkdirSync(startDir, { recursive: true });

    writeFileSync(resolve(workspaceRoot, "README.md"), "# README\n");
    writeFileSync(resolve(workspaceRoot, "CONTRIBUTING.md"), "# CONTRIBUTING\n");
    writeFileSync(resolve(workspaceRoot, "AGENTS.md"), "# AGENTS\n");
    writeFileSync(resolve(workspaceRoot, "package.json"), '{"name":"fixture","scripts":{}}');

    const endpoint = createBookMcpEndpointFromWorkspace({
      startDir,
      bookTitle: "Fixture",
      contentRawModules: createFixtureContentRawModules(),
    });

    const listResponse = await endpoint.POST({
      request: new Request("http://localhost/api/mcp.json", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "resources/list", params: { kind: "governance" } }),
      }),
    });

    const listBody = (await listResponse.json()) as {
      result: {
        resources: Array<{ uri: string; supportsChunking: boolean; supportsSectionIndex: boolean }>;
      };
    };
    const readmeResource = listBody.result.resources.find((resource) => resource.uri === "bookkit://governance/README.md");

    expect(readmeResource?.supportsChunking).toBe(true);
    expect(readmeResource?.supportsSectionIndex).toBe(true);

    const readResponse = await endpoint.POST({
      request: new Request("http://localhost/api/mcp.json", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 4,
          method: "resources/read",
          params: { uri: "bookkit://content/chapters/00-overview", sectionId: "sec-intro", offset: 1, limit: 1 },
        }),
      }),
    });

    const readBody = (await readResponse.json()) as {
      result: {
        contents: Array<{
          text: string;
          metadata: { sectionId: string; chunkId: string; offset: number; limit: number; sectionIndex: Array<{ id: string }> };
        }>;
      };
    };

    expect(readBody.result.contents[0].text).toBe("Line A");
    expect(readBody.result.contents[0].metadata.sectionId).toBe("sec-intro");
    expect(readBody.result.contents[0].metadata.offset).toBe(1);
    expect(readBody.result.contents[0].metadata.limit).toBe(1);
    expect(readBody.result.contents[0].metadata.chunkId).toContain("#sec-intro:");
    expect(readBody.result.contents[0].metadata.sectionIndex.map((entry) => entry.id)).toEqual(["sec-intro", "sec-deep-dive"]);
  });

});
