import { createSlugger } from "../utils/markdown";
import { extractConceptFlags } from "./concept-triage";
import { normalizeText } from "./tokenize";
import type { ContentSuggestion } from "./types";

export type MechanismProposalOptions = {
	book: string;
	/** Chapter bodies for candidate extraction. */
	chapterBodies: Array<{ file: string; body: string }>;
	/** Terms already registered as mechanisms or glossary entries. */
	vocabulary?: string[];
	/** Frames how the mechanism drafts express is/isNot. */
	causalStance?: string;
	/** Maximum candidate mechanisms to propose. */
	maxCandidates?: number;
};

const DEFAULT_MAX_CANDIDATES = 5;

export type MechanismDraft = {
	slug: string;
	title: string;
	definition: string;
	is: string[];
	isNot: string[];
};

const buildDraft = (term: string, causalStance?: string): MechanismDraft => {
	const stance = causalStance?.trim();
	return {
		slug: createSlugger()(term),
		title: term,
		definition: stance
			? `${term}: ${stance.replace(/\.$/, "")}, applied as a repeatable pattern instead of one-off heroics.`
			: `${term}: a repeatable pattern that converts a sticky situation into a bounded, deliberate next step.`,
		is: [
			stance
				? `${stance.replace(/\.$/, "")} as a named, repeatable process`
				: (term as string),
		],
		isNot: [
			"a one-off intervention performed under pressure with no structure",
		],
	};
};

export const proposeMechanismCandidates = (
	options: MechanismProposalOptions,
): ContentSuggestion[] => {
	const maxCandidates = options.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
	const vocabulary = new Set(
		(options.vocabulary ?? []).map((term) => normalizeText(term)),
	);

	const flags = extractConceptFlags(options.chapterBodies).filter(
		(flag) =>
			!vocabulary.has(normalizeText(flag.term)) &&
			flag.occurrences >= 2 &&
			flag.files.length >= 2,
	);

	return flags.slice(0, maxCandidates).map((flag) => {
		const draft = buildDraft(flag.term, options.causalStance);
		return {
			category: "mechanism-proposal",
			severity: "advisory",
			book: options.book,
			file: flag.files[0],
			message: `"${flag.term}" recurs ${flag.occurrences} times across ${flag.files.length} files and is not a registered mechanism. Draft candidate ready for review.`,
			nextAction:
				"Review the proposed definition and is/isNot boundaries. If it is a named concept the book teaches, register it as a mechanism; otherwise remove or adopt it as glossary vocabulary.",
			evidence: {
				term: flag.term,
				occurrences: flag.occurrences,
				files: flag.files,
				draft,
			} satisfies Record<string, unknown>,
		};
	});
};
