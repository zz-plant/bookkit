import type { MechanismDraft } from "../suggestions";

export type FrameDetection = {
	/** Detected frame slug, drawn from the registered frames ("runbook" or "intervention"). */
	frameSlug: string;
	/** Fraction of all detected frame signals pointing at the chosen frame. */
	confidence: number;
	runbookHits: number;
	teachingHits: number;
	/** Whether the frame came from book.config.ts ("declared") or content analysis ("detected"). */
	source: "declared" | "detected";
};

export type MechanismProposal = MechanismDraft & {
	id: string;
};

/**
 * What the proposal read, so "no mechanism proposals" can be told apart
 * from "nothing was analyzed".
 */
export type ProposalAnalysis = {
	/** Chapter files with prose left once code, markup, and headings are removed. */
	chaptersRead: number;
	wordsRead: number;
	/** Recurring terms that match a registered mechanism, glossary term, or tool. */
	registered: Array<{
		term: string;
		registeredAs: string;
		occurrences: number;
	}>;
	/** Recurring unregistered terms used too little to propose (under 3 uses, or 1 file). */
	belowThreshold: Array<{ term: string; occurrences: number; files: number }>;
};

export type EdgeProposal = {
	id: string;
	/** Chapter that should list the introduction as a prerequisite. */
	chapter: string;
	introducedIn: string;
	mechanism: string;
};

export type ToolProposal = {
	id: string;
	mechanism: string;
	name: string;
	slug: string;
};

export type ConfigDraft = {
	id: "config:detected";
	frame: FrameDetection;
	readerStart: string;
	readerEnd: string;
	transformation: string;
	intent: string;
	/** Full book.config.ts source the author can adopt or edit. */
	source: string;
};

export type ProposalBundle = {
	book: string;
	generatedAt: string;
	frame: FrameDetection;
	analysis: ProposalAnalysis;
	mechanisms: MechanismProposal[];
	edges: EdgeProposal[];
	tools: ToolProposal[];
	config: ConfigDraft;
};
