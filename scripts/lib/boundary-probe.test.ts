import { describe, expect, it } from "bun:test";
import { probeMechanismBoundary } from "./boundary-probe";

describe("probeMechanismBoundary", () => {
	it("probes the boundary between two mechanisms in on-call", () => {
		const report = probeMechanismBoundary(
			"bounded-escalation",
			"incident-triage",
			{ book: "on-call" },
		);
		expect(report.mechanismA.slug).toBe("bounded-escalation");
		expect(report.mechanismB.slug).toBe("incident-triage");
		expect(report.divergenceAxis).toBeDefined();
		expect(report.vignettes.length).toBe(3);
		expect(report.sharpeningRecommendations.forA).toBeDefined();
		expect(report.sharpeningRecommendations.forB).toBeDefined();
	});

	it("throws when either mechanism is not found", () => {
		expect(() =>
			probeMechanismBoundary("missing-mech-1", "incident-triage", {
				book: "on-call",
			}),
		).toThrow('Mechanism "missing-mech-1" not found');
	});
});
