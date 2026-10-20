import { describe, expect, it } from "bun:test";
import { searchQueryFromPath } from "./search-from-path";

describe("searchQueryFromPath", () => {
	it("keeps the words of the address and drops the route", () => {
		expect(searchQueryFromPath("/read/toolkit/classify-severity/")).toBe(
			"classify severity",
		);
		expect(searchQueryFromPath("/read/glossary/Sev_1")).toBe("sev");
		expect(searchQueryFromPath("/v/0.1.0/read/chapters/rollback-first")).toBe(
			"rollback first",
		);
	});

	it("drops file extensions and percent-encoding", () => {
		expect(searchQueryFromPath("/exports/chapters/drills.pdf")).toBe(
			"exports drills",
		);
		expect(searchQueryFromPath("/read/pager%20queue")).toBe("pager queue");
	});

	it("is empty for an address with no words of its own", () => {
		expect(searchQueryFromPath("/read/chapters/")).toBe("");
		expect(searchQueryFromPath("/")).toBe("");
	});
});
