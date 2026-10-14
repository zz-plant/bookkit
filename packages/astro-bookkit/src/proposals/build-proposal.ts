import {
	type ChapterRecord,
	findRecurringTerms,
	type MechanismRecord,
	mechanismCandidates,
	mechanismDraftFor,
	suggestPrerequisiteEdges,
	type ToolRecord,
} from "../suggestions";
import { createSlugger } from "../utils/markdown";
import {
	type ConfigProposalOptions,
	proposeConfigDraft,
} from "./config-proposal";
import { detectFrameFromBodies } from "./frame-detection";
import type {
	ConfigDraft,
	EdgeProposal,
	MechanismProposal,
	ProposalAnalysis,
	ProposalBundle,
	ToolProposal,
} from "./types";

export type BuildProposalBundleOptions = {
	book: string;
	chapters: ChapterRecord[];
	chapterBodies: Array<{ file: string; body: string }>;
	mechanisms: MechanismRecord[];
	tools: ToolRecord[];
	glossaryTerms: string[];
	/** Author-declared frame from an existing book.config.ts; wins over detection. */
	existingFrame?: string;
	title?: string;
	/** Used by the config draft only; mechanism drafts carry no prose. */
	causalStance?: string;
	maxMechanismProposals?: number;
};

const DEFAULT_MAX_MECHANISM_PROPOSALS = 5;

/**
 * A tool proposal names the mechanism it serves and nothing more: the slug
 * follows the toolkit's `<mechanism>--<tool>` convention with a placeholder
 * tool part (as `new book`'s `starter-mechanism--starter-tool` does), so the
 * author renames it once the tool's move is known.
 */
const toolProposalFor = (mechanism: MechanismRecord): ToolProposal => {
	const slug = `${createSlugger()(mechanism.slug)}--starter-tool`;
	return {
		id: `tool:${slug}`,
		mechanism: mechanism.slug,
		name: `Starter tool for ${mechanism.title || mechanism.slug}`,
		slug,
	};
};

export const buildProposalBundle = (
	options: BuildProposalBundleOptions,
): ProposalBundle => {
	const { book, chapters, chapterBodies, mechanisms, glossaryTerms } = options;

	const vocabulary = [
		...mechanisms.map((m) => m.slug),
		...mechanisms.map((m) => m.title),
		...glossaryTerms,
		...options.tools.map((t) => t.name ?? t.title ?? t.slug),
	].filter(Boolean);

	const recurring = findRecurringTerms(chapterBodies, { vocabulary });
	const proposable = mechanismCandidates(recurring.candidates);
	const proposedMechanisms: MechanismProposal[] = proposable
		.slice(0, options.maxMechanismProposals ?? DEFAULT_MAX_MECHANISM_PROPOSALS)
		.map((flag) => {
			const draft = mechanismDraftFor(flag);
			return { id: `mechanism:${draft.slug}`, ...draft };
		});
	const analysis: ProposalAnalysis = {
		chaptersRead: recurring.filesRead,
		wordsRead: recurring.wordsRead,
		registered: recurring.registered.map((flag) => ({
			term: flag.term,
			registeredAs: flag.registeredAs,
			occurrences: flag.occurrences,
		})),
		belowThreshold: recurring.candidates
			.filter((flag) => !proposable.includes(flag))
			.map((flag) => ({
				term: flag.term,
				occurrences: flag.occurrences,
				files: flag.files.length,
			})),
	};

	const detection = detectFrameFromBodies(chapterBodies);
	const frame = options.existingFrame
		? {
				frameSlug: options.existingFrame,
				confidence: 1,
				runbookHits: detection.runbookHits,
				teachingHits: detection.teachingHits,
				source: "declared" as const,
			}
		: detection;

	const edgeSuggestions = suggestPrerequisiteEdges({
		book,
		chapters,
		mechanismSlugs: mechanisms.map((m) => m.slug),
	});

	const edges: EdgeProposal[] = edgeSuggestions.flatMap((suggestion) => {
		const chapter = suggestion.evidence.chapter;
		const introducedIn = suggestion.evidence.introducedIn;
		const mechanism = suggestion.evidence.mechanism;
		if (
			typeof chapter !== "string" ||
			typeof introducedIn !== "string" ||
			typeof mechanism !== "string"
		) {
			return [];
		}
		return [
			{
				id: `edge:${introducedIn}->${chapter}`,
				chapter,
				introducedIn,
				mechanism,
			},
		];
	});

	const toolsByMechanism = new Map<string, ToolRecord[]>();
	for (const tool of options.tools) {
		const list = toolsByMechanism.get(tool.mechanism) ?? [];
		list.push(tool);
		toolsByMechanism.set(tool.mechanism, list);
	}

	const toolMechanisms: MechanismRecord[] = [];
	if (frame.frameSlug === "runbook") {
		for (const existing of mechanisms) {
			if ((toolsByMechanism.get(existing.slug) ?? []).length === 0) {
				toolMechanisms.push(existing);
			}
		}
	}
	for (const draft of proposedMechanisms) {
		toolMechanisms.push({
			slug: draft.slug,
			title: draft.title,
			definition: "",
			is: [],
			isNot: [],
			predictions: [],
			tests: [],
		});
	}

	const tools: ToolProposal[] = [];
	for (const mechanism of toolMechanisms) {
		const proposal = toolProposalFor(mechanism);
		if (tools.some((tool) => tool.slug === proposal.slug)) continue;
		tools.push(proposal);
	}

	const configOptions: ConfigProposalOptions = {
		book,
		title: options.title,
		frame,
		causalStance: options.causalStance,
	};
	const config: ConfigDraft = proposeConfigDraft(configOptions);

	return {
		book,
		generatedAt: new Date().toISOString(),
		frame,
		analysis,
		mechanisms: proposedMechanisms,
		edges,
		tools,
		config,
	};
};
