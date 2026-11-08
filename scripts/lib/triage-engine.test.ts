import { describe, expect, it } from "bun:test";
import { triageIncident } from "./triage-engine";

describe("triageIncident", () => {
	it("returns empty result for blank query", async () => {
		const result = await triageIncident("");
		expect(result.candidates).toEqual([]);
		expect(result.action).toBeUndefined();
	});

	it("diagnoses on-call escalation symptoms and maps to an action", async () => {
		const result = await triageIncident(
			"pager alert sev-1 incident escalation",
			{
				books: ["on-call"],
			},
		);
		expect(result.candidates.length).toBeGreaterThan(0);
		const top = result.candidates[0];
		expect(top.book).toBe("on-call");
		expect(top.score).toBeGreaterThan(0);
		expect(top.action).toBeDefined();
		expect(top.action?.timeboxMinutes).toBeLessThanOrEqual(10);
		expect(top.action?.steps.length).toBeGreaterThan(0);
	});

	it("discriminates between candidate mechanisms when multiple match", async () => {
		const result = await triageIncident("rollback deploy and ramp escalation", {
			books: ["on-call"],
		});
		if (result.candidates.length >= 2) {
			expect(result.discriminatingQuestion).toBeDefined();
			expect(result.discriminatingQuestion?.prompt).toContain(
				"To differentiate between",
			);
			expect(result.discriminatingQuestion?.candidateA.criteria).toBeDefined();
			expect(result.discriminatingQuestion?.candidateB.criteria).toBeDefined();
		}
	});

	it("diagnoses running-hot queue and handoff symptoms", async () => {
		const result = await triageIncident(
			"handoff reset documentation queue tollbooth",
			{
				books: ["running-hot"],
			},
		);
		expect(result.candidates.length).toBeGreaterThan(0);
		const top = result.candidates[0];
		expect(top.book).toBe("running-hot");
		expect(top.action).toBeDefined();
		expect(top.action?.failureLooksLike.length).toBeGreaterThan(0);
		expect(top.action?.legitimateDemand.length).toBeGreaterThan(0);
	});
});
