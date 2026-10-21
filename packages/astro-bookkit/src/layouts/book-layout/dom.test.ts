import { describe, expect, it } from "bun:test";

import { sitePath } from "./dom";

describe("sitePath: where a search result or a cited passage may link", () => {
	it("keeps a path to one of the book's pages, with its fragment and query", () => {
		for (const path of [
			"/read/chapters/rollback-first",
			"/read/chapters/rollback-first#step-2",
			"/read/toolkit/page-the-owner?from=search",
			"/es/read/glosario/caf%C3%A9",
			"/",
		]) {
			expect(sitePath(path)).toBe(path);
		}
	});

	it("refuses any address that leads to another site, or is not a path from the site's root", () => {
		for (const value of [
			"https://evil.example/read/chapters/one",
			"http://evil.example",
			"//evil.example/read",
			"/\\evil.example/read",
			"/\t/evil.example/read",
			"\\\\evil.example/read",
			"javascript:alert(1)",
			"JaVaScRiPt:alert(1)",
			"data:text/html,<script>alert(1)</script>",
			"mailto:someone@example.com",
			"read/chapters/one",
			"#step-2",
			"",
			// Absolute, even to the page's own origin: the index and the
			// server write paths, so anything else did not come from them.
			"https://book.example/read/chapters/one",
		]) {
			expect(sitePath(value), value).toBeNull();
		}
		for (const value of [null, undefined, 42, { url: "/read" }, ["/read"]]) {
			expect(sitePath(value)).toBeNull();
		}
	});
});
