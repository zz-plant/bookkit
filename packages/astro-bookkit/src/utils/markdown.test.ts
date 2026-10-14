import { describe, expect, it } from "bun:test";
import { compile } from "@mdx-js/mdx";

import { toMdxBody } from "./markdown";

// Markdown as real exports write it: placeholders, raw HTML, comments, autolinks.
const HAZARDS = [
	"# Restart the {service}",
	"",
	"<!-- owner: platform team {temp} -->",
	"Page <on-call-lead> if the queue exceeds {limit}.",
	"See <https://example.com/runbooks> and <https://example.com/a?b=c>.",
	"Line one<br>line two, and an empty fragment <> here.",
	"<details><summary>More</summary>hidden</details>",
	"Use `kubectl get {pods}` and ``a `{x}` b`` inline.",
	"",
	"```sh",
	"curl https://x/{id} # <!-- not a comment -->",
	"```",
	"",
	"    indented {text} is prose in MDX",
].join("\n");

describe("toMdxBody", () => {
	it("produces a body MDX compiles", async () => {
		await expect(compile(HAZARDS)).rejects.toThrow();
		const { body } = toMdxBody(HAZARDS);
		await expect(compile(body)).resolves.toBeDefined();
	});

	it("leaves code exactly as written", () => {
		const { body } = toMdxBody(HAZARDS);
		expect(body).toContain("`kubectl get {pods}`");
		expect(body).toContain("``a `{x}` b``");
		expect(body).toContain("curl https://x/{id} # <!-- not a comment -->");
	});

	it("says what it changed", () => {
		const { body, changes } = toMdxBody(HAZARDS);
		expect(changes.htmlComments).toBe(1);
		expect(changes.autolinks).toBe(2);
		expect(changes.braces).toBe(6);
		expect(changes.tags).toBe(6);
		expect(body).toContain("{/* owner: platform team {temp} */}");
		expect(body).toContain(
			"[https://example.com/runbooks](https://example.com/runbooks)",
		);
		expect(body).toContain("Line one<br />line two");
	});

	it("changes nothing in plain Markdown", () => {
		const plain = "# Title\n\nSome *prose* with a [link](https://x.y).\n";
		expect(toMdxBody(plain)).toEqual({
			body: plain,
			changes: { htmlComments: 0, braces: 0, autolinks: 0, tags: 0 },
		});
	});
});
