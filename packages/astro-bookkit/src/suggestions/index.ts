import type { ConceptFlag } from "./concept-triage";
import { triageConcepts } from "./concept-triage";
import type { ExampleRecord } from "./example-audit";
import { auditExampleSwappability } from "./example-audit";
import type { MechanismRecord } from "./mechanism-overlap";
import { analyzeMechanismOverlap } from "./mechanism-overlap";
import { proposeMechanismCandidates } from "./mechanism-proposals";
import type { ChapterRecord } from "./prerequisite-suggestions";
import { suggestPrerequisiteEdges } from "./prerequisite-suggestions";
import type { ToolRecord } from "./runbook-coverage";
import { auditRunbookCoverage } from "./runbook-coverage";
import type { ContentSuggestion } from "./types";

export type {
	ConceptClassification,
	ConceptFlag,
	ConceptTriageOptions,
} from "./concept-triage";
export {
	classifyConcept,
	extractConceptFlags,
	MULTI_WORD_CONCEPT_PATTERN,
	triageConcepts,
} from "./concept-triage";
export type { ExampleAuditOptions, ExampleRecord } from "./example-audit";
export { auditExampleSwappability } from "./example-audit";
export type {
	MechanismOverlapOptions,
	MechanismRecord,
} from "./mechanism-overlap";
export { analyzeMechanismOverlap } from "./mechanism-overlap";
export type {
	MechanismDraft,
	MechanismProposalOptions,
} from "./mechanism-proposals";
export { proposeMechanismCandidates } from "./mechanism-proposals";
export type {
	ChapterRecord,
	PrerequisiteSuggestionOptions,
} from "./prerequisite-suggestions";
export { suggestPrerequisiteEdges } from "./prerequisite-suggestions";
export type {
	AuditRunbookCoverageOptions,
	ComplianceRow,
	ComplianceSummary,
	ToolRecord,
} from "./runbook-coverage";
export {
	auditRunbookCoverage,
	deriveComplianceMatrix,
	summarizeCompliance,
} from "./runbook-coverage";
export type {
	ContentSuggestion,
	SuggestionCategory,
	SuggestionSeverity,
} from "./types";

export type BookContentInput = {
	book: string;
	mechanisms: MechanismRecord[];
	chapters: ChapterRecord[];
	examples: ExampleRecord[];
	chapterBodies: Array<{ file: string; body: string }>;
	conceptFlags: ConceptFlag[];
	vocabulary?: string[];
	causalStance?: string;
	maxMechanismProposals?: number;
	/** The book's configured frame slug (runbook books get coverage checks). */
	frame?: string;
	tools?: ToolRecord[];
};

export const runBookSuggestions = (
	input: BookContentInput,
): ContentSuggestion[] => [
	...analyzeMechanismOverlap(input.mechanisms, { book: input.book }),
	...triageConcepts(input.conceptFlags, {
		book: input.book,
		vocabulary: input.vocabulary,
	}),
	...auditExampleSwappability(input.examples, {
		book: input.book,
		mechanisms: input.mechanisms,
	}),
	...suggestPrerequisiteEdges({
		book: input.book,
		chapters: input.chapters,
		mechanismSlugs: input.mechanisms.map((m) => m.slug),
	}),
	...proposeMechanismCandidates({
		book: input.book,
		chapterBodies: input.chapterBodies,
		vocabulary: input.vocabulary,
		causalStance: input.causalStance,
		maxCandidates: input.maxMechanismProposals,
	}),
	...auditRunbookCoverage({
		book: input.book,
		frame: input.frame,
		mechanisms: input.mechanisms,
		tools: input.tools ?? [],
	}),
];
