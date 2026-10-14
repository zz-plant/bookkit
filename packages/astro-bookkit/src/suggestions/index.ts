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
	ConceptExample,
	ConceptFlag,
	ConceptTriageOptions,
	RecurringTermOptions,
	RecurringTermsReport,
} from "./concept-triage";
export {
	classifyConcept,
	describeExample,
	extractConceptFlags,
	findRecurringTerms,
	triageConcepts,
} from "./concept-triage";
export type {
	CorpusCluster,
	CorpusDistinctDecision,
	CorpusMechanism,
	CorpusOverlapOptions,
	CorpusOverlapReport,
	CorpusPair,
	CorpusSharedMechanism,
} from "./corpus-overlap";
export {
	analyzeCorpusOverlap,
	corpusEmbeddingText,
	DEFAULT_SEMANTIC_OVERLAP_THRESHOLD,
} from "./corpus-overlap";
export type { ExampleAuditOptions, ExampleRecord } from "./example-audit";
export { auditExampleSwappability } from "./example-audit";
export type {
	LexicalMechanismSimilarity,
	MechanismOverlapOptions,
	MechanismRecord,
} from "./mechanism-overlap";
export {
	analyzeMechanismOverlap,
	DEFAULT_LEXICAL_OVERLAP_THRESHOLD,
	lexicalMechanismSimilarity,
} from "./mechanism-overlap";
export type {
	MechanismDraft,
	MechanismProposalOptions,
} from "./mechanism-proposals";
export {
	mechanismCandidates,
	mechanismDraftFor,
	proposeMechanismCandidates,
} from "./mechanism-proposals";
export type {
	ChapterRecord,
	PrerequisiteSuggestionOptions,
} from "./prerequisite-suggestions";
export { suggestPrerequisiteEdges } from "./prerequisite-suggestions";
export type {
	AuditRunbookCoverageOptions,
	ComplianceMatrixOptions,
	ComplianceRow,
	ComplianceSummary,
	ReleaseRecord,
	ReviewCadenceStatus,
	ToolRecord,
} from "./runbook-coverage";
export {
	auditReleaseControlDrift,
	auditReviewCadence,
	auditRunbookCoverage,
	deriveComplianceMatrix,
	deriveReviewCadence,
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
	maxMechanismProposals?: number;
	/** The book's configured frame slug (runbook books get coverage checks). */
	frame?: string;
	tools?: ToolRecord[];
};

export const runBookSuggestions = (
	input: BookContentInput,
): ContentSuggestion[] => {
	const proposals = proposeMechanismCandidates({
		book: input.book,
		chapterBodies: input.chapterBodies,
		vocabulary: input.vocabulary,
		maxCandidates: input.maxMechanismProposals,
	});
	// A term with a mechanism draft is reported once, as the draft.
	const proposed = new Set(proposals.map((p) => p.evidence.term));
	return [
		...analyzeMechanismOverlap(input.mechanisms, { book: input.book }),
		...triageConcepts(
			input.conceptFlags.filter((flag) => !proposed.has(flag.term)),
			{ book: input.book, vocabulary: input.vocabulary },
		),
		...auditExampleSwappability(input.examples, {
			book: input.book,
			mechanisms: input.mechanisms,
		}),
		...suggestPrerequisiteEdges({
			book: input.book,
			chapters: input.chapters,
			mechanismSlugs: input.mechanisms.map((m) => m.slug),
		}),
		...proposals,
		...auditRunbookCoverage({
			book: input.book,
			frame: input.frame,
			mechanisms: input.mechanisms,
			tools: input.tools ?? [],
		}),
	];
};
