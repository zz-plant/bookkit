import { afterAll, describe, expect, it } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { handleRequest } from "../jsonrpc-router";
import type { McpEndpointOptions } from "../types";
import { runTool } from ".";

/**
 * The tools an agent writes a book with, against a workspace book other than
 * the served one: the `book` argument, the read index, check_content's book
 * checks and compile, and write_content.
 */

const workspace = mkdtempSync(join(tmpdir(), "bookkit-mcp-authoring-"));
afterAll(() => rmSync(workspace, { recursive: true, force: true }));

const content = join(workspace, "apps", "notes", "src", "content", "book");
for (const section of [
	"chapters",
	"mechanisms",
	"toolkit",
	"examples",
	"glossary",
]) {
	mkdirSync(join(content, section), { recursive: true });
}
writeFileSync(
	join(workspace, "apps", "notes", "src", "book.config.ts"),
	'export const bookConfig = { title: "Notes", status: "draft" };\n',
);
writeFileSync(
	join(content, "chapters", "01-start.mdx"),
	"---\nslug: start\ntitle: Start\nsummary: Where it begins.\nstatus: draft\n---\n\n# Start\n\nText.\n",
);

const options: McpEndpointOptions = {
	bookTitle: "Served",
	bookSlug: "served",
	workspaceRoot: workspace,
	contentRawModules: {
		chapters: {},
		mechanisms: {},
		toolkit: {},
		glossary: {},
		examples: {},
	},
};

const chapter = (slug: string, front: string, body = "Text.\n") =>
	`---\nslug: ${slug}\ntitle: ${slug}\nsummary: A chapter.\nstatus: draft\n${front}---\n\n${body}`;

describe("the book argument", () => {
	it("names the workspace's books when the one given is not there", async () => {
		const result = await runTool(options, "bookkit.list_content", {
			book: "nots",
		});
		expect(result.ok).toBe(false);
		expect(result.error?.machineCode).toBe("UNKNOWN_BOOK");
		expect(result.error?.cause).toBe("Books: notes.");
	});

	it("reads another workspace book from disk", async () => {
		const listed = await runTool(options, "bookkit.list_content", {
			book: "notes",
		});
		expect(listed.payload).toMatchObject({ book: "notes", total: 1 });
	});
});

describe("read_book", () => {
	it("returns an index without text unless a slug or full is given", async () => {
		const index = await runTool(options, "bookkit.read_book", {
			book: "notes",
		});
		const [record] = (index.payload as { records: Record<string, unknown>[] })
			.records;
		expect(record).toMatchObject({ section: "chapters", slug: "01-start" });
		expect(record).not.toHaveProperty("text");

		const one = await runTool(options, "bookkit.read_book", {
			book: "notes",
			section: "chapter",
			slug: "01-start",
		});
		expect(
			(one.payload as { records: Array<{ text: string }> }).records[0].text,
		).toContain("Where it begins.");
	});
});

describe("check_content", () => {
	it("checks prerequisites against the book's chapters", async () => {
		const result = await runTool(options, "bookkit.check_content", {
			book: "notes",
			section: "chapters",
			source: chapter("next", "prerequisites:\n  - strat\n"),
		});
		expect(JSON.stringify(result.payload)).toContain("UNKNOWN_PREREQUISITE");
	});

	it("runs the MDX compiler the build uses", async () => {
		const result = await runTool(options, "bookkit.check_content", {
			book: "notes",
			section: "chapter",
			source: chapter("next", "", "A literal {brace in prose.\n"),
		});
		expect(result.ok).toBe(false);
		expect(JSON.stringify(result.payload)).toContain("MDX_COMPILE");
	});
});

describe("write_content", () => {
	it("refuses a file that does not compile, and writes one that does after the last chapter", async () => {
		const broken = await runTool(options, "bookkit.write_content", {
			book: "notes",
			section: "chapter",
			source: chapter("next", "", "A literal {brace in prose.\n"),
		});
		expect(broken.ok).toBe(false);
		expect(broken.summary).toStartWith("Not written.");

		const written = await runTool(options, "bookkit.write_content", {
			book: "notes",
			section: "chapter",
			source: chapter("next", "prerequisites:\n  - start\n"),
		});
		expect(written.ok).toBe(true);
		expect(written.payload).toMatchObject({
			path: "apps/notes/src/content/book/chapters/02-next.mdx",
			replaced: false,
		});
		expect(existsSync(join(content, "chapters", "02-next.mdx"))).toBe(true);
	});

	it("replaces the file that has the slug only with overwrite: true", async () => {
		const source = chapter("next", "", "Rewritten.\n");
		const refused = await runTool(options, "bookkit.write_content", {
			book: "notes",
			section: "chapter",
			source,
		});
		expect(refused.ok).toBe(false);
		expect(refused.error?.nextAction).toContain("overwrite: true");

		const replaced = await runTool(options, "bookkit.write_content", {
			book: "notes",
			section: "chapter",
			source,
			overwrite: true,
		});
		expect(replaced.payload).toMatchObject({ replaced: true });
		expect(
			readFileSync(join(content, "chapters", "02-next.mdx"), "utf8"),
		).toContain("Rewritten.");
	});

	it("keeps a file name inside the section folder", async () => {
		const outside = await runTool(options, "bookkit.write_content", {
			book: "notes",
			section: "chapter",
			source: chapter("away", ""),
			file: "../../book.config.ts",
		});
		expect(outside.ok).toBe(false);
		expect(outside.summary).toContain("inside the section folder");
	});
});

describe("tools/call", () => {
	it("reports an argument the tool does not take, instead of ignoring it", async () => {
		const response = (await handleRequest(options, {
			jsonrpc: "2.0",
			id: 1,
			method: "tools/call",
			params: { name: "bookkit.read_book", arguments: { bok: "notes" } },
		})) as {
			result: {
				isError: boolean;
				structuredContent: { summary: string; error: { nextAction: string } };
			};
		};
		expect(response.result.isError).toBe(true);
		expect(response.result.structuredContent.summary).toBe(
			'bookkit.read_book takes no argument "bok".',
		);
		expect(response.result.structuredContent.error.nextAction).toContain(
			"book",
		);
	});

	it("annotates each tool in tools/list", async () => {
		const response = (await handleRequest(options, {
			jsonrpc: "2.0",
			id: 2,
			method: "tools/list",
		})) as {
			result: {
				tools: Array<{
					name: string;
					annotations: { readOnlyHint: boolean; destructiveHint: boolean };
				}>;
			};
		};
		const byName = new Map(
			response.result.tools.map((tool) => [tool.name, tool.annotations]),
		);
		expect(byName.get("bookkit.read_book")?.readOnlyHint).toBe(true);
		expect(byName.get("bookkit.write_content")).toMatchObject({
			readOnlyHint: false,
			destructiveHint: true,
		});
	});
});
