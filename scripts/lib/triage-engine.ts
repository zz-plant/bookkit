import { tokenize } from "../../packages/astro-bookkit/src/suggestions/tokenize";
import { listBookDirs } from "../_lib";
import {
	findSimilarMechanismsByMeaning,
	type MechanismMatch,
} from "./authoring";
import { type LoadedBookContent, loadBookContent } from "./load-book";

export type TriageAction = {
	toolSlug?: string;
	toolName: string;
	mechanismSlug: string;
	mechanismTitle: string;
	book: string;
	timeboxMinutes: number;
	trigger?: string;
	steps: string[];
	failureLooksLike: string[];
	legitimateDemand: string[];
};

export type TriageCandidate = {
	slug: string;
	title: string;
	book: string;
	definition: string;
	score: number;
	matchedTerms: string[];
	tests: string[];
	action?: TriageAction;
};

export type DiscriminatingQuestion = {
	prompt: string;
	candidateA: { slug: string; title: string; criteria: string };
	candidateB: { slug: string; title: string; criteria: string };
};

export type TriageResult = {
	query: string;
	books: string[];
	method: "wording" | "semantic";
	candidates: TriageCandidate[];
	discriminatingQuestion?: DiscriminatingQuestion;
	action?: TriageAction;
};

export type TriageOptions = {
	books?: string[];
	semantic?: boolean;
	limit?: number;
};

const round = (value: number): number => Math.round(value * 100) / 100;

/**
 * Diagnoses an operational symptom or incident against the mechanism corpus
 * and maps the diagnostic verdict to an executable <= 10-minute runbook action.
 */
export async function triageIncident(
	query: string,
	options: TriageOptions = {},
): Promise<TriageResult> {
	const trimmed = query.trim();
	if (!trimmed) {
		return {
			query: "",
			books: [],
			method: "wording",
			candidates: [],
		};
	}

	const books =
		options.books && options.books.length > 0 ? options.books : listBookDirs();
	const limit = options.limit ?? 3;

	const loadedBooks = new Map<string, LoadedBookContent>();
	for (const book of books) {
		loadedBooks.set(book, loadBookContent(book));
	}

	// Try semantic search if requested
	if (options.semantic) {
		const semanticResult = await findSimilarMechanismsByMeaning(
			{ title: trimmed, definition: trimmed },
			books,
			limit,
		);
		if (semanticResult && "matches" in semanticResult) {
			const candidates = mapMatchesToCandidates(
				semanticResult.matches,
				loadedBooks,
			);
			return buildTriageResult(
				trimmed,
				books,
				"semantic",
				candidates,
				loadedBooks,
			);
		}
	}

	// Wording / token-based TF-IDF triage
	const queryTokens = tokenize(trimmed);
	if (queryTokens.length === 0) {
		return {
			query: trimmed,
			books,
			method: "wording",
			candidates: [],
		};
	}

	const allMechanisms: Array<{
		book: string;
		slug: string;
		title: string;
		definition: string;
		tests: string[];
		is: string[];
		isNot: string[];
		predictions: string[];
		textTokens: Set<string>;
		testTokens: Set<string>;
	}> = [];

	for (const [book, content] of loadedBooks.entries()) {
		for (const mech of content.mechanisms) {
			const testsText = mech.tests.join(" ");
			const isText = mech.is.join(" ");
			const isNotText = mech.isNot.join(" ");
			const predText = mech.predictions.join(" ");
			const fullText = `${mech.title} ${mech.definition} ${testsText} ${isText} ${isNotText} ${predText}`;

			allMechanisms.push({
				book,
				slug: mech.slug,
				title: mech.title,
				definition: mech.definition,
				tests: mech.tests,
				is: mech.is,
				isNot: mech.isNot,
				predictions: mech.predictions,
				textTokens: new Set(tokenize(fullText)),
				testTokens: new Set(tokenize(testsText)),
			});
		}
	}

	// Inverse document frequency weights
	const totalDocs = allMechanisms.length;
	const idf = (token: string): number => {
		const containing = allMechanisms.filter((m) =>
			m.textTokens.has(token),
		).length;
		return Math.log((totalDocs + 1) / (containing + 1)) + 1;
	};

	const queryWeightTotal = queryTokens.reduce((sum, t) => sum + idf(t), 0);

	const scored = allMechanisms
		.map((mech) => {
			const sharedTokens = queryTokens.filter((t) => mech.textTokens.has(t));
			if (sharedTokens.length === 0) return null;

			// Score calculation: tokens matching tests get 1.5x boost
			let tokenScore = 0;
			for (const t of sharedTokens) {
				const weight = idf(t);
				const isTestMatch = mech.testTokens.has(t);
				tokenScore += isTestMatch ? weight * 1.5 : weight;
			}

			// Subtraction penalty if matching isNot
			const isNotTokens = new Set(tokenize(mech.isNot.join(" ")));
			for (const t of queryTokens) {
				if (isNotTokens.has(t)) {
					tokenScore *= 0.6;
				}
			}

			const normalizedScore =
				queryWeightTotal > 0 ? tokenScore / queryWeightTotal : 0;

			return {
				slug: mech.slug,
				title: mech.title,
				book: mech.book,
				definition: mech.definition,
				score: round(normalizedScore),
				matchedTerms: Array.from(new Set(sharedTokens)),
				tests: mech.tests,
			};
		})
		.filter((c): c is NonNullable<typeof c> => c !== null && c.score > 0.05)
		.sort((a, b) => b.score - a.score)
		.slice(0, limit);

	return buildTriageResult(trimmed, books, "wording", scored, loadedBooks);
}

function mapMatchesToCandidates(
	matches: MechanismMatch[],
	loadedBooks: Map<string, LoadedBookContent>,
): TriageCandidate[] {
	return matches.map((match) => {
		const book = match.books[0] || "";
		const content = loadedBooks.get(book);
		const mech = content?.mechanisms.find((m) => m.slug === match.slug);
		return {
			slug: match.slug,
			title: match.title,
			book,
			definition: mech?.definition || "",
			score: match.score,
			matchedTerms: match.sharedWords,
			tests: mech?.tests || [],
		};
	});
}

function buildTriageResult(
	query: string,
	books: string[],
	method: "wording" | "semantic",
	candidates: TriageCandidate[],
	loadedBooks: Map<string, LoadedBookContent>,
): TriageResult {
	// Attach bound tools to candidates
	for (const candidate of candidates) {
		const bookContent = loadedBooks.get(candidate.book);
		const tool = bookContent?.tools.find(
			(t) => t.mechanism === candidate.slug || t.slug.includes(candidate.slug),
		);

		if (tool) {
			candidate.action = {
				toolSlug: tool.slug,
				toolName: tool.name || tool.title || tool.slug,
				mechanismSlug: candidate.slug,
				mechanismTitle: candidate.title,
				book: candidate.book,
				timeboxMinutes: tool.timeboxMinutes ?? 10,
				trigger: tool.trigger,
				steps:
					tool.steps && tool.steps.length > 0
						? tool.steps
						: [
								`Verify whether "${candidate.title}" explains the observed failure symptom.`,
								`Examine the operational boundary and verify documented test conditions.`,
								`Escalate with specific failure criteria rather than generic complaints.`,
							],
				failureLooksLike:
					tool.failureLooksLike && tool.failureLooksLike.length > 0
						? tool.failureLooksLike
						: [
								"The issue is treated as an individual communication issue rather than a structural failure.",
								"No explicit deadline or named owner is attached to the remediation.",
							],
				legitimateDemand:
					tool.legitimateDemand && tool.legitimateDemand.length > 0
						? tool.legitimateDemand
						: [
								`What specific mechanism or control prevents this failure from recurring?`,
								`Who is the single named owner accountable for this boundary?`,
							],
			};
		} else if (candidate.tests.length > 0) {
			// Synthesize a <= 10-minute diagnostic drill from mechanism tests
			candidate.action = {
				toolName: `Diagnostic Drill: ${candidate.title}`,
				mechanismSlug: candidate.slug,
				mechanismTitle: candidate.title,
				book: candidate.book,
				timeboxMinutes: 10,
				trigger: `Observed symptom matches ${candidate.title}.`,
				steps: candidate.tests.map((test, idx) => `Step ${idx + 1}: ${test}`),
				failureLooksLike: [
					"Team debates intentions instead of checking concrete boundary tests.",
					"Incident stays open with no observable discrimination metric.",
				],
				legitimateDemand: [
					`Can we run the discrimination test: "${candidate.tests[0]}" right now?`,
				],
			};
		}
	}

	// Derive discriminating question between top 2 candidates
	let discriminatingQuestion: DiscriminatingQuestion | undefined;
	if (candidates.length >= 2) {
		const top = candidates[0];
		const second = candidates[1];
		const topCriteria =
			top.tests[0] ||
			top.definition ||
			`Characteristics specific to ${top.title}`;
		const secondCriteria =
			second.tests[0] ||
			second.definition ||
			`Characteristics specific to ${second.title}`;

		discriminatingQuestion = {
			prompt: `To differentiate between "${top.title}" and "${second.title}", which condition is currently true?`,
			candidateA: {
				slug: top.slug,
				title: top.title,
				criteria: topCriteria,
			},
			candidateB: {
				slug: second.slug,
				title: second.title,
				criteria: secondCriteria,
			},
		};
	}

	return {
		query,
		books,
		method,
		candidates,
		discriminatingQuestion,
		action: candidates[0]?.action,
	};
}
