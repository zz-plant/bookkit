import { describe, expect, it } from "bun:test";
import {
	computeTopologicalOrder,
	deriveReaderPathways,
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
});
