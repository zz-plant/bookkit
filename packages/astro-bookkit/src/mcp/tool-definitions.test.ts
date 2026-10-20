import { afterAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { handleRequest } from "./jsonrpc-router";
import { TOOL_DEFINITIONS } from "./tool-definitions";
import { runTool } from "./tool-handlers";
import type { ToolDefinitionMetadata } from "./tool-handlers/types";
import type { McpEndpointOptions } from "./types";

const emptyContent = {
	chapters: {},
	mechanisms: {},
	toolkit: {},
	glossary: {},
	examples: {},
};

describe("TOOL_DEFINITIONS", () => {
	it("requires complete operational metadata for every tool", () => {
		expect(TOOL_DEFINITIONS.length).toBeGreaterThan(0);

		for (const tool of TOOL_DEFINITIONS) {
			expect(tool.expectedRuntime.length).toBeGreaterThan(0);
			expect(tool.expectedRuntimeClass.length).toBeGreaterThan(0);
			expect(tool.sideEffectLevel.length).toBeGreaterThan(0);
			expect(typeof tool.idempotent).toBe("boolean");
			expect(tool.idempotencyGuarantee.length).toBeGreaterThan(0);
			expect(tool.retryGuidance.length).toBeGreaterThan(0);
			expect(tool.retryPolicyGuidance.length).toBeGreaterThan(0);
			expect(tool.failureClassTaxonomy.length).toBeGreaterThan(0);
		}
	});
});

describe("tools/list describes the status rule", () => {
	const response = handleRequest(
		{ bookTitle: "Fixture", contentRawModules: emptyContent },
		{ jsonrpc: "2.0", id: 1, method: "tools/list" },
	) as { result: { tools: ToolDefinitionMetadata[] } };
	const tools = new Map(
		response.result.tools.map((tool) => [tool.name, tool] as const),
	);
	const argDescription = (tool: string, arg: string) =>
		(
			tools.get(tool as ToolDefinitionMetadata["name"])?.inputSchema.properties[
				arg
			] as { description?: string } | undefined
		)?.description ?? "";

	it("advertises no per-tool rate limit, since neither transport enforces one", () => {
		for (const tool of response.result.tools) {
			expect(tool).not.toHaveProperty("rateLimit");
		}
	});

	it("no longer says release mode is about draft examples, or needs --mode/--no-drafts", () => {
		const listed = JSON.stringify(response.result.tools);
		expect(listed).not.toContain("draft examples");
		expect(listed).not.toContain("--no-drafts");
		expect(listed).not.toContain("--mode");
	});

	it("says the book's status decides, and what releaseMode forces", () => {
		for (const name of [
			"bookkit.validate_book",
			"bookkit.compile_book",
		] as const) {
			expect(tools.get(name)?.description).toContain(
				"a published or stable book gets release rules",
			);
		}
		for (const name of ["bookkit.validate_book", "bookkit.check_content"]) {
			const description = argDescription(name, "releaseMode");
			expect(description).toContain("true applies release rules");
			expect(description).toContain("the book's status");
		}
	});
});

describe("tools follow the book's status", () => {
	const workspace = mkdtempSync(join(tmpdir(), "bookkit-mcp-status-"));
	afterAll(() => rmSync(workspace, { recursive: true, force: true }));

	const writeBook = (slug: string, status: string) => {
		mkdirSync(join(workspace, "apps", slug, "src"), { recursive: true });
		writeFileSync(
			join(workspace, "apps", slug, "src", "book.config.ts"),
			`export default { slug: "${slug}", title: "T", status: "${status}" };\n`,
		);
	};
	writeBook("released", "published");
	writeBook("writing", "draft");
	// compile_book's command, echoed instead of compiling.
	writeFileSync(
		join(workspace, "package.json"),
		JSON.stringify({ scripts: { "compile:book": "echo compile" } }),
	);

	const options = (bookSlug: string): McpEndpointOptions => ({
		bookTitle: "Fixture",
		bookSlug,
		workspaceRoot: workspace,
		contentRawModules: emptyContent,
	});
	const draftChapter =
		"---\ntitle: Intro\nslug: intro\nsummary: What this book is for.\nstatus: draft\n---\n\n# Intro\n";
	const codes = (result: ReturnType<typeof runTool>) =>
		(
			(result.payload as { findings: Array<{ code: string }> }).findings ?? []
		).map((finding) => finding.code);

	it("check_content holds a draft record in a published book to release rules, as validate does", () => {
		const released = runTool(options("released"), "bookkit.check_content", {
			section: "chapter",
			source: draftChapter,
		});
		expect(released.ok).toBe(false);
		expect(codes(released)).toContain("DRAFT_IN_RELEASE");
		expect(released.payload).toMatchObject({
			bookStatus: "published",
			releaseRules: true,
		});

		const writing = runTool(options("writing"), "bookkit.check_content", {
			section: "chapter",
			source: draftChapter,
		});
		expect(writing.ok).toBe(true);
		expect(writing.payload).toMatchObject({
			bookStatus: "draft",
			releaseRules: false,
		});

		const forced = runTool(options("writing"), "bookkit.check_content", {
			section: "chapter",
			source: draftChapter,
			releaseMode: true,
		});
		expect(codes(forced)).toContain("DRAFT_IN_RELEASE");
	});

	it("compile_book runs compile:book without the flags it ignores", () => {
		const result = runTool(options("released"), "bookkit.compile_book", {});
		expect(result.payload).toMatchObject({
			command: "bun run compile:book -- --book released",
		});
	});
});
