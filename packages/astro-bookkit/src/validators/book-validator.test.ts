import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { validateBookInMemory } from "./book-validator";

let root: string;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "bookkit-validate-"));
	mkdirSync(
		join(root, "apps", "test-book", "src", "content", "book", "mechanisms"),
		{
			recursive: true,
		},
	);
	mkdirSync(
		join(root, "apps", "test-book", "src", "content", "book", "toolkit"),
		{
			recursive: true,
		},
	);
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

const writeBook = (files: Array<[string, string]>): void => {
	for (const [file, content] of files) {
		writeFileSync(
			join(root, "apps", "test-book", "src", "content", "book", file),
			content,
			"utf8",
		);
	}
};

describe("validateBookInMemory frontmatter parsing", () => {
	it("parses YAML list fields as arrays (no false schema warnings)", () => {
		writeBook([
			[
				"mechanisms/starter-mechanism.mdx",
				`---
slug: starter-mechanism
status: draft
title: "Starter mechanism"
definition: "A repeatable pattern where a system produces harm while preserving surface legitimacy."
is:
  - "A named incentive keeps harm in motion without clear accountability."
isNot:
  - "One-off mistakes with no repeatable structure."
predictions:
  - "If the mechanism is active, similar outcomes will appear across unrelated cases."
tests:
  - "Ask: if the mechanism is active, would the outcome stay the same?"
---
Body.
`,
			],
			[
				"toolkit/starter-mechanism--starter-tool.mdx",
				`---
slug: starter-mechanism--starter-tool
status: draft
mechanism: starter-mechanism
name: "Starter tool"
trigger: "When you notice the same harm repeating even after good-faith effort."
timeboxMinutes: 10
steps:
  - "Name the repeating outcome in one sentence."
failureLooksLike:
  - "You cannot name a repeatable pattern after 10 minutes."
legitimateDemand:
  - "A clear, repeatable description of the harm."
---
Tool body.
`,
			],
		]);

		const result = validateBookInMemory({
			workspaceRoot: root,
			bookSlug: "test-book",
		});

		const schemaIssues = result.warnings.filter(
			(w) =>
				w.machineCode === "MECHANISM_SCHEMA_INVALID" ||
				w.machineCode === "TOOL_SCHEMA_INVALID",
		);
		expect(schemaIssues).toEqual([]);
		expect(result.ok).toBe(true);
	});
});
