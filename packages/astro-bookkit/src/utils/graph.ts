export type GraphNode = {
	slug: string;
	title: string;
	prerequisites: string[];
	type?: "chapter" | "mechanism" | "tool";
	metadata?: Record<string, unknown>;
};

export type CycleResult = {
	hasCycle: boolean;
	cycles: string[][];
};

export type ReadingPathway = {
	name: string;
	description: string;
	slugs: string[];
};

/**
 * Validates whether the dependency graph is a Directed Acyclic Graph (DAG)
 * using depth-first search cycle detection.
 */
export function detectCycles(nodes: GraphNode[]): CycleResult {
	const nodeMap = new Map<string, GraphNode>(nodes.map((n) => [n.slug, n]));
	const visited = new Set<string>();
	const recursionStack = new Set<string>();
	const cycles: string[][] = [];

	function dfs(currentSlug: string, path: string[]) {
		visited.add(currentSlug);
		recursionStack.add(currentSlug);

		const node = nodeMap.get(currentSlug);
		if (node) {
			for (const prereq of node.prerequisites) {
				if (!nodeMap.has(prereq)) {
					continue; // Missing nodes handled separately
				}
				if (!visited.has(prereq)) {
					dfs(prereq, [...path, prereq]);
				} else if (recursionStack.has(prereq)) {
					const cycleStart = path.indexOf(prereq);
					const cycle =
						cycleStart >= 0 ? path.slice(cycleStart) : [prereq, ...path];
					cycles.push([...cycle, prereq]);
				}
			}
		}

		recursionStack.delete(currentSlug);
	}

	for (const node of nodes) {
		if (!visited.has(node.slug)) {
			dfs(node.slug, [node.slug]);
		}
	}

	return {
		hasCycle: cycles.length > 0,
		cycles,
	};
}

/**
 * Computes a valid topological reading order satisfying all prerequisite constraints.
 * If cycles are present, throws a descriptive error.
 */
export function computeTopologicalOrder(nodes: GraphNode[]): string[] {
	const cycleCheck = detectCycles(nodes);
	if (cycleCheck.hasCycle) {
		const cycleDesc = cycleCheck.cycles.map((c) => c.join(" -> ")).join("; ");
		throw new Error(
			`Prerequisite cycle detected in content graph: ${cycleDesc}`,
		);
	}

	const nodeMap = new Map<string, GraphNode>(nodes.map((n) => [n.slug, n]));
	const inDegree = new Map<string, number>();
	const dependents = new Map<string, string[]>();

	for (const node of nodes) {
		inDegree.set(node.slug, 0);
		dependents.set(node.slug, []);
	}

	for (const node of nodes) {
		for (const prereq of node.prerequisites) {
			if (nodeMap.has(prereq)) {
				inDegree.set(node.slug, (inDegree.get(node.slug) ?? 0) + 1);
				dependents.get(prereq)?.push(node.slug);
			}
		}
	}

	// Queue nodes with 0 prerequisites
	const queue: string[] = [];
	for (const [slug, degree] of inDegree.entries()) {
		if (degree === 0) {
			queue.push(slug);
		}
	}

	// Deterministic tie-breaking: sort alphabetically
	queue.sort((a, b) => a.localeCompare(b));

	const sorted: string[] = [];
	while (queue.length > 0) {
		const current = queue.shift();
		if (!current) break;
		sorted.push(current);

		const nextNodes = dependents.get(current) ?? [];
		for (const next of nextNodes) {
			const remaining = (inDegree.get(next) ?? 1) - 1;
			inDegree.set(next, remaining);
			if (remaining === 0) {
				queue.push(next);
				queue.sort((a, b) => a.localeCompare(b));
			}
		}
	}

	return sorted;
}

/**
 * Derives standard reader pathways from a collection of content nodes.
 */
export function deriveReaderPathways(nodes: GraphNode[]): ReadingPathway[] {
	const foundational = computeTopologicalOrder(nodes);

	// Fast path: overview + nodes without deep prerequisite chains
	const fastPath = foundational.slice(0, Math.min(3, foundational.length));

	return [
		{
			name: "Foundational",
			description:
				"Complete reading order derived from conceptual prerequisites.",
			slugs: foundational,
		},
		{
			name: "Fast-Path",
			description:
				"Core framing and initial high-impact insights in under 15 minutes.",
			slugs: fastPath,
		},
	];
}
