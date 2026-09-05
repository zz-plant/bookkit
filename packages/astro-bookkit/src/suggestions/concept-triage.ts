import { normalizeText } from "./tokenize";
import type { ContentSuggestion } from "./types";

export type ConceptFlag = {
	term: string;
	files: string[];
	occurrences: number;
};

export type ConceptTriageOptions = {
	book: string;
	/** Terms already registered as mechanisms or glossary entries. */
	vocabulary?: string[];
};

export type ConceptClassification =
	| "register"
	| "proper-noun"
	| "throwaway"
	| "review";

const MULTI_WORD_CONCEPT_PATTERN = /\b[A-Z][a-z]+(?:[-\s][A-Z][a-z]+){1,3}\b/g;

export { MULTI_WORD_CONCEPT_PATTERN };

export const extractConceptFlags = (
	bodies: Array<{ file: string; body: string }>,
): ConceptFlag[] => {
	const occurrences = new Map<string, number>();
	const files = new Map<string, Set<string>>();

	for (const { file, body } of bodies) {
		const seenInFile = new Set<string>();
		for (const match of body.match(MULTI_WORD_CONCEPT_PATTERN) ?? []) {
			const raw = match.replace(/\s+/g, " ").trim();
			const term = raw.replace(/^The\s+/i, "");
			if (!term) continue;
			if (!seenInFile.has(term)) seenInFile.add(term);
			occurrences.set(term, (occurrences.get(term) ?? 0) + 1);
			if (!files.has(term)) files.set(term, new Set<string>());
			const fileSet = files.get(term);
			if (fileSet) fileSet.add(file);
		}
	}

	return Array.from(occurrences.entries())
		.map(([term, count]) => ({
			term,
			occurrences: count,
			files: Array.from(files.get(term) ?? []),
		}))
		.sort(
			(a, b) => b.occurrences - a.occurrences || a.term.localeCompare(b.term),
		);
};

const PROPER_NOUN_SUFFIXES = [
	"inc",
	"ltd",
	"llc",
	"corp",
	"corporation",
	"university",
	"institute",
	"college",
	"school",
	"council",
	"department",
	"administration",
	"company",
	"hospital",
	"clinic",
	"center",
	"act",
	"commission",
	"agency",
	"association",
	"foundation",
	"department of",
	"bank",
	"federal",
	"national",
	"international",
	"the",
];

const isLikelyProperNoun = (term: string): boolean => {
	const normalized = normalizeText(term);
	for (const suffix of PROPER_NOUN_SUFFIXES) {
		if (normalized.startsWith(suffix) || normalized.endsWith(suffix))
			return true;
	}
	return /\d/.test(term);
};

export const classifyConcept = (
	flag: ConceptFlag,
	vocabulary: Set<string>,
): { classification: ConceptClassification; reason: string } => {
	if (vocabulary.has(normalizeText(flag.term))) {
		return {
			classification: "review",
			reason: "already registered; recheck extraction",
		};
	}
	if (isLikelyProperNoun(flag.term)) {
		return { classification: "proper-noun", reason: "proper-noun signals" };
	}
	if (flag.occurrences >= 3 && flag.files.length >= 2) {
		return {
			classification: "register",
			reason: `${flag.occurrences} occurrences across ${flag.files.length} files`,
		};
	}
	if (flag.occurrences === 1 && flag.files.length === 1) {
		return { classification: "throwaway", reason: "single occurrence" };
	}
	return { classification: "review", reason: "below register threshold" };
};

export const triageConcepts = (
	flags: ConceptFlag[],
	options: ConceptTriageOptions,
): ContentSuggestion[] => {
	const vocabulary = new Set(
		(options.vocabulary ?? []).map((term) => normalizeText(term)),
	);

	return flags.map((flag) => {
		const { classification, reason } = classifyConcept(flag, vocabulary);
		const severity =
			classification === "register" || classification === "review"
				? "advisory"
				: "info";
		const message =
			classification === "register"
				? `"${flag.term}" recurs ${flag.occurrences} times across ${flag.files.length} files and is not registered (${reason}).`
				: `"${flag.term}" classified as ${classification} (${reason}).`;

		return {
			category: "concept-triage",
			severity,
			book: options.book,
			file: flag.files[0],
			message,
			nextAction:
				classification === "register"
					? "Register it as a mechanism or glossary term so the concept is governed and searchable. If it is meant to stay informal, that is acceptable only if it is clearly in-context vocabulary."
					: classification === "review"
						? "Review whether this phrase is a named concept the book should govern."
						: "No action required; this is likely not a governed concept.",
			evidence: {
				term: flag.term,
				occurrences: flag.occurrences,
				files: flag.files,
				classification,
			},
		};
	});
};
