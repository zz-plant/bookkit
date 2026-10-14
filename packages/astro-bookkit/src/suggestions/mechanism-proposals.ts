import { createSlugger } from "../utils/markdown";
import {
	type ConceptExample,
	type ConceptFlag,
	classifyConcept,
	findRecurringTerms,
} from "./concept-triage";
import type { ContentSuggestion } from "./types";

export type MechanismProposalOptions = {
	book: string;
	/** Chapter bodies for candidate extraction. */
	chapterBodies: Array<{ file: string; body: string }>;
	/** Terms already registered as mechanisms or glossary entries. */
	vocabulary?: string[];
	/** Maximum candidate mechanisms to propose. */
	maxCandidates?: number;
};

const DEFAULT_MAX_CANDIDATES = 5;

/**
 * A mechanism the prose seems to use without registering it. Only the name
 * and the evidence come from the text: the definition and is/isNot
 * boundaries are the author's to write, so a draft never carries them.
 */
export type MechanismDraft = {
	slug: string;
	title: string;
	status: "draft";
	evidence: {
		term: string;
		occurrences: number;
		files: string[];
		example?: ConceptExample;
	};
};

/** "context debt" → title "Context debt", slug "context-debt". */
export const mechanismDraftFor = (flag: ConceptFlag): MechanismDraft => {
	const title = flag.term.charAt(0).toUpperCase() + flag.term.slice(1);
	return {
		slug: createSlugger()(flag.term),
		title,
		status: "draft",
		evidence: {
			term: flag.term,
			occurrences: flag.occurrences,
			files: flag.files,
			example: flag.example,
		},
	};
};

/**
 * Recurring unregistered terms used often enough to register (three or more
 * uses across two or more files), as mechanism drafts.
 */
export const mechanismCandidates = (flags: ConceptFlag[]): ConceptFlag[] =>
	flags.filter((flag) => classifyConcept(flag).classification === "register");

export const proposeMechanismCandidates = (
	options: MechanismProposalOptions,
): ContentSuggestion[] => {
	const maxCandidates = options.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
	const { candidates } = findRecurringTerms(options.chapterBodies, {
		vocabulary: options.vocabulary,
	});

	return mechanismCandidates(candidates)
		.slice(0, maxCandidates)
		.map((flag) => {
			const draft = mechanismDraftFor(flag);
			return {
				category: "mechanism-proposal",
				severity: "advisory",
				book: options.book,
				file: flag.example?.file ?? flag.files[0],
				message: `"${flag.term}" recurs ${flag.occurrences} times across ${flag.files.length} files and is not a registered mechanism or glossary term. Draft: ${draft.slug} (definition and boundaries left for you).`,
				nextAction: `If the book names an idea with it, register it: bun run bookkit propose ${options.book} --apply mechanisms --id mechanism:${draft.slug} writes a draft with the evidence, and you write the definition. If it is ordinary wording, leave it.`,
				evidence: {
					term: flag.term,
					occurrences: flag.occurrences,
					files: flag.files,
					example: flag.example,
					draft,
				} satisfies Record<string, unknown>,
			};
		});
};
