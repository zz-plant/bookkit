import { jaccard, normalizePhrases, sharedPhrases, tokenize } from "./tokenize";
import type { ContentSuggestion } from "./types";

export type MechanismRecord = {
	slug: string;
	title: string;
	definition: string;
	is: string[];
	isNot: string[];
	predictions: string[];
	tests: string[];
	satisfies?: string[];
	file?: string;
};

export type MechanismOverlapOptions = {
	book: string;
	/** Combined lexical boundary threshold; pairs at or above this are flagged. */
	threshold?: number;
};

const DEFAULT_THRESHOLD = 0.55;

const round = (value: number): number => Math.round(value * 100) / 100;

export const analyzeMechanismOverlap = (
	mechanisms: MechanismRecord[],
	options: MechanismOverlapOptions,
): ContentSuggestion[] => {
	const threshold = options.threshold ?? DEFAULT_THRESHOLD;
	const suggestions: ContentSuggestion[] = [];

	for (let i = 0; i < mechanisms.length; i += 1) {
		for (let j = i + 1; j < mechanisms.length; j += 1) {
			const a = mechanisms[i];
			const b = mechanisms[j];

			const definitionSimilarity = jaccard(
				tokenize(a.definition),
				tokenize(b.definition),
			);

			const boundarySimilarity = jaccard(
				tokenize([...a.is, ...a.isNot].join(" ")),
				tokenize([...b.is, ...b.isNot].join(" ")),
			);

			const sharedIs = sharedPhrases(
				normalizePhrases(a.is),
				normalizePhrases(b.is),
			);
			const sharedIsNot = sharedPhrases(
				normalizePhrases(a.isNot),
				normalizePhrases(b.isNot),
			);
			const sharedBoundary = [...sharedIs, ...sharedIsNot];

			const combined = definitionSimilarity * 0.6 + boundarySimilarity * 0.4;
			if (combined < threshold && sharedBoundary.length === 0) continue;

			const overlapDetail =
				sharedBoundary.length > 0
					? `${sharedBoundary.length} shared boundary ${sharedBoundary.length === 1 ? "phrase" : "phrases"} and lexical similarity ${round(combined)}`
					: `lexical similarity ${round(combined)} (definitions ${round(definitionSimilarity)}, boundaries ${round(boundarySimilarity)})`;

			suggestions.push({
				category: "mechanism-overlap",
				severity: "advisory",
				book: options.book,
				file: a.file ?? a.slug,
				message: `${a.title} and ${b.title} overlap: ${overlapDetail}.`,
				nextAction:
					"Decide whether these are genuinely distinct. If yes, sharpen their is/isNot boundaries. If no, fold one into the other and delete the duplicate.",
				evidence: {
					pair: [a.slug, b.slug],
					definitionSimilarity: round(definitionSimilarity),
					boundarySimilarity: round(boundarySimilarity),
					combined: round(combined),
					sharedBoundaryPhrases: sharedBoundary,
				},
			});
		}
	}

	return suggestions;
};
