import { describe, expect, it } from "bun:test";
import { handleRequest } from "./jsonrpc-router";
import { getPrompt, PROMPT_DEFINITIONS } from "./prompts";
import type { McpEndpointOptions } from "./types";

const options: McpEndpointOptions = {
	bookTitle: "Tiny",
	contentRawModules: {
		chapters: {
			"/src/content/book/chapters/01-the-stall.mdx":
				"---\nslug: the-stall\ntitle: The Stall\n---\n\n## Claim\n\nA stall is chosen.\n",
		},
		mechanisms: {
			"/src/content/book/mechanisms/slow-walk.mdx":
				'---\nslug: slow-walk\ntitle: "Slow walk"\ndefinition: "A chosen crawl."\n---\n',
		},
		toolkit: {
			"/src/content/book/toolkit/ask-for-a-date.mdx":
				'---\nslug: ask-for-a-date\nname: "Ask for a date"\nsteps:\n  - "Ask when."\n---\n',
		},
		glossary: {},
		examples: {},
	},
};

const text = (result: ReturnType<typeof getPrompt>) =>
	"error" in result ? result.error : result.messages[0].content.text;

describe("getPrompt", () => {
	it("carries the mechanism's file and the reader's situation, tests before a verdict", () => {
		const prompt = text(
			getPrompt(options, "bookkit.apply_mechanism", {
				mechanism: "slow-walk",
				situation: "My permit has sat in review for nine weeks.",
			}),
		);
		expect(prompt).toContain('definition: "A chosen crawl."');
		expect(prompt).toContain("My situation: My permit has sat in review");
		expect(prompt.indexOf("Run each of its tests")).toBeLessThan(
			prompt.indexOf("Only then say whether it applies"),
		);
	});

	it("walks a tool one step at a time, asking for the situation when none is given", () => {
		const prompt = text(
			getPrompt(options, "bookkit.run_tool", { tool: "ask-for-a-date" }),
		);
		expect(prompt).toContain('- "Ask when."');
		expect(prompt).toContain("First ask me what I want to use it on");
	});

	it("drafts through check_content and writes only when told", () => {
		const prompt = text(
			getPrompt(options, "bookkit.draft_chapter", { chapter: "the-stall" }),
		);
		expect(prompt).toContain("bookkit.check_content");
		expect(prompt).toContain("only when I say to");
		expect(prompt).toContain("A stall is chosen.");
	});

	it("names what is missing, and the entries a misnamed one could be", () => {
		expect(text(getPrompt(options, "bookkit.apply_mechanism", {}))).toBe(
			"bookkit.apply_mechanism needs mechanism and situation.",
		);
		expect(
			text(
				getPrompt(options, "bookkit.apply_mechanism", {
					mechanism: "slow",
					situation: "x",
				}),
			),
		).toBe('Tiny has no mechanism "slow". Its mechanisms: slow-walk.');
		expect(text(getPrompt(options, "bookkit.nope"))).toContain(
			"Unknown prompt",
		);
	});
});

describe("prompts over JSON-RPC", () => {
	it("lists the prompts, says so in its capabilities, and returns an error for a bad call", async () => {
		const init = (await handleRequest(options, {
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
		})) as { result: { capabilities: Record<string, unknown> } };
		expect(init.result.capabilities.prompts).toEqual({ listChanged: false });
		const listed = (await handleRequest(options, {
			jsonrpc: "2.0",
			id: 2,
			method: "prompts/list",
		})) as { result: { prompts: unknown[] } };
		expect(listed.result.prompts).toEqual([...PROMPT_DEFINITIONS]);
		const bad = (await handleRequest(options, {
			jsonrpc: "2.0",
			id: 3,
			method: "prompts/get",
			params: { name: "bookkit.run_tool", arguments: {} },
		})) as { error: { code: number; message: string } };
		expect(bad.error).toEqual({
			code: -32602,
			message: "Invalid params: bookkit.run_tool needs tool.",
		});
	});
});
