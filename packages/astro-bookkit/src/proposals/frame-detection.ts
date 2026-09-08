import type { FrameDetection } from "./types";

/**
 * Heuristic frame detection for a proposed book.
 *
 * This is a proposal, not a decision: the detected frame only fills a config
 * draft, which the author adopts or edits. The configured frame in
 * `book.config.ts` remains the sole authority for validation.
 */
const RUNBOOK_SIGNALS = [
	"escalation",
	"escalate",
	"rollback",
	"trigger",
	"incident",
	"on-call",
	"oncall",
	"runbook",
	"drill",
	"drilled",
	"compliance",
	"severity",
	"pager",
	"alert",
	"owner",
	"ownership",
	"sla",
	"recovery",
];

const TEACHING_SIGNALS = [
	"learn",
	"understand",
	"practice",
	"principle",
	"reflect",
	"exercise",
	"agency",
	"reader",
	"pattern",
	"lesson",
	"insight",
	"sticky",
];

const countSignals = (
	bodies: Array<{ file?: string; body: string }>,
	signals: string[],
): number => {
	let hits = 0;
	for (const { body } of bodies) {
		const haystack = body.toLowerCase();
		for (const signal of signals) {
			const re = new RegExp(`\\b${signal}\\b`, "g");
			const matches = haystack.match(re);
			if (matches) hits += matches.length;
		}
	}
	return hits;
};

export const detectFrameFromBodies = (
	bodies: Array<{ file?: string; body: string }>,
): FrameDetection => {
	const runbookHits = countSignals(bodies, RUNBOOK_SIGNALS);
	const teachingHits = countSignals(bodies, TEACHING_SIGNALS);
	const total = runbookHits + teachingHits;

	if (total === 0) {
		return {
			frameSlug: "intervention",
			confidence: 0,
			runbookHits: 0,
			teachingHits: 0,
			source: "detected",
		};
	}

	const runbookDominates = runbookHits >= 3 && runbookHits > teachingHits;
	const frameSlug = runbookDominates ? "runbook" : "intervention";
	const confidence =
		frameSlug === "runbook" ? runbookHits / total : teachingHits / total;

	return {
		frameSlug,
		confidence,
		runbookHits,
		teachingHits,
		source: "detected",
	};
};
