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
	evidence: {
		term: string;
		occurrences: number;
		files: string[];
	};
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
	mechanisms: MechanismProposal[];
	edges: EdgeProposal[];
	tools: ToolProposal[];
	config: ConfigDraft;
};
