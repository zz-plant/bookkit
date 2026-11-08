import { describe, expect, it } from "bun:test";
import { redteamTool } from "./redteam-engine";

describe("redteamTool", () => {
	it("red-teams an existing tool in match-to-july", () => {
		const report = redteamTool("check-the-w4", { book: "match-to-july" });
		expect(report.toolSlug).toBe("check-the-w4");
		expect(report.book).toBe("match-to-july");
		expect(report.resilienceScore).toBeGreaterThanOrEqual(0);
		expect(report.resilienceScore).toBeLessThanOrEqual(100);
		expect(report.simulatedDialogue.length).toBeGreaterThan(1);
		expect(report.recommendedFailureLooksLike).toBeDefined();
		expect(report.recommendedLegitimateDemand).toBeDefined();
	});

	it("identifies vulnerabilities and hardened defenses for on-call tools", () => {
		const report = redteamTool("ramp-escalation", { book: "on-call" });
		expect(report.toolSlug).toBe("ramp-escalation");
		expect(report.book).toBe("on-call");
		expect(report.vulnerabilities.length).toBeGreaterThanOrEqual(0);
	});

	it("throws helpful error when tool is not found", () => {
		expect(() => redteamTool("non-existent-tool-xyz")).toThrow(
			'Tool "non-existent-tool-xyz" not found',
		);
	});
});
