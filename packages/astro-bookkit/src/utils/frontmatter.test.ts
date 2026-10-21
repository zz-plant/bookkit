import { describe, expect, it } from "bun:test";
import { formatFrontmatter, parseFrontmatter } from "./frontmatter";

describe("parseFrontmatter", () => {
	it("reads an unquoted date as a Date, as js-yaml 4 did", () => {
		const parsed = parseFrontmatter("---\ndate: 2026-03-02\n---\nBody");
		expect(parsed.status).toBe("ok");
		expect(parsed.data.date).toBeInstanceOf(Date);
		expect((parsed.data.date as Date).toISOString()).toBe(
			"2026-03-02T00:00:00.000Z",
		);
	});

	it("reads YAML 1.1 words as strings, not booleans", () => {
		const parsed = parseFrontmatter("---\nanswer: yes\nmode: on\n---\n");
		expect(parsed.data).toEqual({ answer: "yes", mode: "on" });
	});

	it("says where YAML that does not parse goes wrong", () => {
		const parsed = parseFrontmatter("---\ntitle: [unclosed\n---\n");
		expect(parsed.status).toBe("invalid");
		expect(parsed.reason).toMatch(/at line \d+/);
	});
});

describe("formatFrontmatter", () => {
	it("quotes values a YAML 1.1 reader would not read as strings", () => {
		const block = formatFrontmatter({ answer: "yes", mode: "on", code: "017" });
		expect(block).toBe("---\nanswer: 'yes'\nmode: 'on'\ncode: '017'\n---\n");
	});

	it("reads back what it writes", () => {
		const data = {
			title: "Title: with a colon # and a hash",
			tags: ["a", "b"],
			summary: "- starts with a dash",
		};
		expect(parseFrontmatter(`${formatFrontmatter(data)}Body`).data).toEqual(
			data,
		);
	});
});
