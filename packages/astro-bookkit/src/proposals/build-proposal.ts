import {
	type ChapterRecord,
	type MechanismDraft,
	type MechanismRecord,
	proposeMechanismCandidates,
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
	causalStance?: string;
	maxMechanismProposals?: number;
};

const toolNameFromMechanism = (mechanism: MechanismRecord): string =>
	mechanism.title || mechanism.slug;

const toolSlugForMechanism = (mechanism: MechanismRecord): string =>
	createSlugger()(`${mechanism.slug} ${toolNameFromMechanism(mechanism)}`);

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

	const mechanismSuggestions = proposeMechanismCandidates({
		book,
		chapterBodies,
		vocabulary,
		causalStance: options.causalStance,
		maxCandidates: options.maxMechanismProposals,
	});

	const proposedMechanisms: MechanismProposal[] = mechanismSuggestions.map(
		(suggestion) => {
			const draft = suggestion.evidence.draft as MechanismDraft;
			const evidence = suggestion.evidence as unknown as {
				term: string;
				occurrences: number;
				files: string[];
			};
			return {
				id: `mechanism:${draft.slug}`,
				...draft,
				evidence,
			};
		},
	);

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
			definition: draft.definition,
			is: draft.is,
			isNot: draft.isNot,
			predictions: [],
			tests: [],
		});
	}

	const seenToolSlugs = new Set<string>();
	const tools: ToolProposal[] = [];
	for (const mechanism of toolMechanisms) {
		const name = toolNameFromMechanism(mechanism);
		const slug = toolSlugForMechanism(mechanism);
		if (seenToolSlugs.has(slug)) continue;
		seenToolSlugs.add(slug);
		tools.push({ id: `tool:${slug}`, mechanism: mechanism.slug, name, slug });
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
		mechanisms: proposedMechanisms,
		edges,
		tools,
		config,
	};
};
