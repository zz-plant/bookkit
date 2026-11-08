import { tokenize } from "../../packages/astro-bookkit/src/suggestions/tokenize";
import { listBookDirs } from "../_lib";
import { type LoadedBookContent, loadBookContent } from "./load-book";

export type SyntheticVignette = {
	title: string;
	scenario: string;
	triggersA: string[];
	triggersB: string[];
	verdict: "mechanism_a" | "mechanism_b" | "ambiguous";
	rationale: string;
};

export type BoundaryProbeReport = {
	mechanismA: {
		slug: string;
		title: string;
		book: string;
		definition: string;
		tests: string[];
	};
	mechanismB: {
		slug: string;
		title: string;
		book: string;
		definition: string;
		tests: string[];
	};
	sharedTerms: string[];
	divergenceAxis: string;
	ambiguityScore: number;
	vignettes: SyntheticVignette[];
	sharpeningRecommendations: {
		forA: {
			suggestedIsNot?: string;
			suggestedTest?: string;
		};
		forB: {
			suggestedIsNot?: string;
			suggestedTest?: string;
		};
	};
};

/**
 * Probes the semantic boundary between two mechanisms by generating synthetic
 * edge-case vignettes and evaluating decision divergence.
 */
export function probeMechanismBoundary(
	slugA: string,
	slugB: string,
	options: { book?: string } = {},
): BoundaryProbeReport {
	const books = options.book ? [options.book] : listBookDirs();

	type LocatedMech = LoadedBookContent["mechanisms"][number] & { book: string };
	let mechA: LocatedMech | undefined;
	let mechB: LocatedMech | undefined;

	for (const book of books) {
		const content = loadBookContent(book);
		for (const m of content.mechanisms) {
			if (m.slug === slugA && !mechA) {
				mechA = { ...m, book };
			}
			if (m.slug === slugB && !mechB) {
				mechB = { ...m, book };
			}
		}
	}

	if (!mechA) {
		throw new Error(
			`Mechanism "${slugA}" not found in books: ${books.join(", ")}`,
		);
	}
	if (!mechB) {
		throw new Error(
			`Mechanism "${slugB}" not found in books: ${books.join(", ")}`,
		);
	}

	const tokensA = new Set(
		tokenize(`${mechA.title} ${mechA.definition} ${mechA.tests.join(" ")}`),
	);
	const tokensB = new Set(
		tokenize(`${mechB.title} ${mechB.definition} ${mechB.tests.join(" ")}`),
	);

	const sharedTerms = Array.from(tokensA).filter((t) => tokensB.has(t));

	// Primary divergence axis
	const testA0 = mechA.tests[0] || mechA.definition || mechA.title;
	const testB0 = mechB.tests[0] || mechB.definition || mechB.title;
	const divergenceAxis = `Whether the failure is governed by [${testA0}] vs [${testB0}]`;

	// Check existing separation: whether mechA.isNot mentions mechB or vice-versa
	const aExcludesB =
		mechA.isNot.some(
			(s) =>
				s.toLowerCase().includes(mechB.slug) ||
				s.toLowerCase().includes(mechB.title.toLowerCase()),
		) || mechA.tests.some((s) => s.toLowerCase().includes(mechB.slug));
	const bExcludesA =
		mechB.isNot.some(
			(s) =>
				s.toLowerCase().includes(mechA.slug) ||
				s.toLowerCase().includes(mechA.title.toLowerCase()),
		) || mechB.tests.some((s) => s.toLowerCase().includes(mechA.slug));

	let ambiguityScore = 0.5;
	if (aExcludesB && bExcludesA) {
		ambiguityScore = 0.15;
	} else if (aExcludesB || bExcludesA) {
		ambiguityScore = 0.35;
	} else if (sharedTerms.length > 5) {
		ambiguityScore = 0.75;
	}

	// Generate synthetic vignettes
	const vignettes: SyntheticVignette[] = [
		{
			title: `Edge Case 1: Borderline ${mechA.title}`,
			scenario: `An incident occurs where an operator observes symptoms matching "${mechA.title}", but institutional pressure attempts to reframe it as routine delays typical of "${mechB.title}".`,
			triggersA: [testA0],
			triggersB: [],
			verdict: "mechanism_a",
			rationale: `Although superficial traits resemble ${mechB.title}, the primary causal lever matches ${mechA.title}'s core test: "${testA0}".`,
		},
		{
			title: `Edge Case 2: Borderline ${mechB.title}`,
			scenario: `A failure presents with surface vocabulary of "${mechA.title}", yet the underlying institutional constraint is driven by "${testB0}".`,
			triggersA: [],
			triggersB: [testB0],
			verdict: "mechanism_b",
			rationale: `The presence of ${testB0} establishes that ${mechB.title} is the root mechanism, while ${mechA.title} is merely downstream or symptomatic.`,
		},
		{
			title: `Edge Case 3: Compound Boundary Collision`,
			scenario: `A systemic bottleneck where both "${testA0}" and "${testB0}" appear simultaneously in the incident sequence.`,
			triggersA: [testA0],
			triggersB: [testB0],
			verdict: "ambiguous",
			rationale: `Both mechanisms have observable criteria present. Discrimination requires an explicit causal ordering rule.`,
		},
	];

	const sharpeningRecommendations = {
		forA: {
			suggestedIsNot: `Failures where the primary barrier is "${testB0}" (see ${mechB.slug}).`,
			suggestedTest: `Verify that "${testA0}" occurs independently of "${mechB.title}".`,
		},
		forB: {
			suggestedIsNot: `Failures where the root cause is "${testA0}" (see ${mechA.slug}).`,
			suggestedTest: `Confirm that resolving "${mechA.title}" does not automatically clear the condition.`,
		},
	};

	return {
		mechanismA: {
			slug: mechA.slug,
			title: mechA.title,
			book: mechA.book,
			definition: mechA.definition,
			tests: mechA.tests,
		},
		mechanismB: {
			slug: mechB.slug,
			title: mechB.title,
			book: mechB.book,
			definition: mechB.definition,
			tests: mechB.tests,
		},
		sharedTerms,
		divergenceAxis,
		ambiguityScore,
		vignettes,
		sharpeningRecommendations,
	};
}
