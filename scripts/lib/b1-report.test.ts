import { describe, expect, it } from "bun:test";
import { missingBaselineReason } from "./b1-report";

describe("missingBaselineReason", () => {
	it("gives a shallow clone the one command that restores the baseline", () => {
		expect(missingBaselineReason("2026-10-07", true)).toBe(
			"this clone is shallow, so it has no commit before 2026-10-07. Fetch the rest of its history once: git fetch --unshallow origin",
		);
	});

	it("says plainly when the full history has no commit that old", () => {
		expect(missingBaselineReason("2026-10-07", false)).toBe(
			"no commit before 2026-10-07 in this repository's history",
		);
	});
});
