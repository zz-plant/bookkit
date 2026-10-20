import { afterAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { handleValidateBook } from "./validate_book";

describe("validate_book's failure", () => {
	const workspace = mkdtempSync(join(tmpdir(), "bookkit-mcp-validate-"));
	afterAll(() => rmSync(workspace, { recursive: true, force: true }));

	const app = join(workspace, "apps", "broken");
	for (const section of [
		"chapters",
		"mechanisms",
		"toolkit",
		"examples",
		"glossary",
	]) {
		mkdirSync(join(app, "src", "content", "book", section), {
			recursive: true,
		});
	}
	writeFileSync(
		join(app, "src", "book.config.ts"),
		'export default { slug: "broken", title: "Broken", status: "draft" };\n',
	);
	// No slug and no title: two errors.
	writeFileSync(
		join(app, "src", "content", "book", "chapters", "01-untitled.mdx"),
		"---\nstatus: draft\n---\nBody.\n",
	);

	const result = handleValidateBook({
		options: {
			bookTitle: "Broken",
			bookSlug: "broken",
			workspaceRoot: workspace,
			contentRawModules: {
				chapters: {},
				mechanisms: {},
				toolkit: {},
				glossary: {},
				examples: {},
			},
		},
		args: {},
	});

	it("names the book and its error count, and how to rerun the tool", () => {
		expect(result.ok).toBe(false);
		expect(result.error).toMatchObject({
			machineCode: "VALIDATE_BOOK_COMMAND_FAILED",
			cause: "2 validation error(s) in broken.",
			humanSummary: "Validation failed for broken: 2 error(s).",
			location: { module: "validators/book-validator.ts" },
		});
		expect(result.error?.nextAction).toContain("rerun bookkit.validate_book");
	});

	it("does not name validate:book, which the tool no longer runs", () => {
		expect(JSON.stringify(result.error)).not.toContain("validate:book");
		expect(JSON.stringify(result.error)).not.toContain("exited with code");
	});
});
