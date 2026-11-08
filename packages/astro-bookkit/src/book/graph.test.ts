import { describe, expect, it } from "bun:test";
import {
	computeTopologicalOrder,
	deriveReaderPathways,
	deriveRolePathways,
	detectCycles,
	type GraphNode,
} from "./graph";

describe("graph pedagogical engine", () => {
	it("detects acyclic dependencies and computes deterministic topological order", () => {
		const nodes: GraphNode[] = [
			{ slug: "mechanisms", title: "Mechanisms", prerequisites: ["overview"] },
			{ slug: "overview", title: "Overview", prerequisites: [] },
			{ slug: "toolkit", title: "Toolkit", prerequisites: ["mechanisms"] },
		];

		const order = computeTopologicalOrder(nodes);
		expect(order).toEqual(["overview", "mechanisms", "toolkit"]);
	});

	it("detects circular prerequisite dependencies", () => {
		const nodes: GraphNode[] = [
			{ slug: "node-a", title: "A", prerequisites: ["node-b"] },
			{ slug: "node-b", title: "B", prerequisites: ["node-a"] },
		];

		const cycleResult = detectCycles(nodes);
		expect(cycleResult.hasCycle).toBe(true);
		expect(cycleResult.cycles.length).toBeGreaterThan(0);

		expect(() => computeTopologicalOrder(nodes)).toThrow(
			/Prerequisite cycle detected/,
		);
	});

	it("derives foundational and fast-path reading pathways", () => {
		const nodes: GraphNode[] = [
			{ slug: "intro", title: "Intro", prerequisites: [] },
			{ slug: "ch1", title: "Ch1", prerequisites: ["intro"] },
			{ slug: "ch2", title: "Ch2", prerequisites: ["ch1"] },
			{ slug: "ch3", title: "Ch3", prerequisites: ["ch2"] },
		];

		const pathways = deriveReaderPathways(nodes);
		expect(pathways).toHaveLength(2);
		expect(pathways[0].name).toBe("Foundational");
		expect(pathways[0].slugs).toEqual(["intro", "ch1", "ch2", "ch3"]);
		expect(pathways[1].name).toBe("Fast-Path");
		expect(pathways[1].slugs).toEqual(["intro", "ch1", "ch2"]);
	});

	it("derives role-based pathways including emergency triage and structural governance", () => {
		const nodes: GraphNode[] = [
			{ slug: "core-policy", title: "Core Policy", prerequisites: [] },
			{ slug: "sub-a", title: "Sub A", prerequisites: ["core-policy"] },
			{ slug: "sub-b", title: "Sub B", prerequisites: ["core-policy"] },
			{
				slug: "incident-triage-runbook",
				title: "Incident Triage Runbook",
				prerequisites: ["core-policy"],
				type: "tool",
			},
		];

		const rolePathways = deriveRolePathways(nodes);
		expect(rolePathways.length).toBeGreaterThanOrEqual(4);

		const names = rolePathways.map((p) => p.name);
		expect(names).toContain("Foundational");
		expect(names).toContain("Fast-Path");
		expect(names).toContain("Emergency Triage");
		expect(names).toContain("Structural Governance");

		const triage = rolePathways.find((p) => p.name === "Emergency Triage");
		expect(triage?.slugs).toContain("incident-triage-runbook");

		const governance = rolePathways.find(
			(p) => p.name === "Structural Governance",
		);
		// core-policy has 3 dependents, so it should rank highest in governance
		expect(governance?.slugs[0]).toBe("core-policy");
	});
});
