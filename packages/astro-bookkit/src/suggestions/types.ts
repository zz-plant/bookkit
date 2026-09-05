export type SuggestionSeverity = "info" | "advisory" | "warning";

export type SuggestionCategory =
	| "mechanism-overlap"
	| "concept-triage"
	| "example-swap"
	| "prerequisite-edge"
	| "mechanism-proposal";

export type ContentSuggestion = {
	category: SuggestionCategory;
	severity: SuggestionSeverity;
	book: string;
	file?: string;
	message: string;
	nextAction: string;
	evidence: Record<string, unknown>;
};
