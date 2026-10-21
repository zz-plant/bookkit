import type { CorpusDistinctDecision } from "../../packages/astro-bookkit/src/suggestions";

/**
 * Scores an embedding model against the author's rulings in corpus.json, so a
 * model or cutoff change for check:corpus is measured rather than argued.
 *
 * A merge ruling records the two mechanisms as they were before the author
 * combined them. A good model scores that pair above most pairs in today's
 * corpus, and above the pairs the author ruled distinct.
 */

/** One side of a merge, as it was before the merge: the fields corpusEmbeddingText reads. */
export type CorpusMergeSide = {
	book: string;
	slug: string;
	title: string;
	definition: string;
	is: string[];
};

/** An author's ruling that two mechanisms were one idea, kept for check:corpus --eval. */
export type CorpusMergeRecord = {
	into: string;
	date: string;
	reason: string;
	before: [CorpusMergeSide, CorpusMergeSide];
};

export type CorpusEvalInput = {
	/** Today's mechanisms, one per slug, with one vector each in the same order. */
	slugs: string[];
	vectors: ReadonlyArray<ArrayLike<number>>;
	/** One vector per side of each merge ruling. */
	merges: Array<{
		into: string;
		vectors: [ArrayLike<number>, ArrayLike<number>];
	}>;
	distinct: CorpusDistinctDecision[];
	/** The model's cutoff in check:corpus. */
	threshold: number;
};

export type CorpusEvalPair = { a: string; b: string; score: number };

export type CorpusEvalFlagged = {
	cutoff: number;
	/** Pairs in today's corpus at or above the cutoff. */
	flagged: number;
	ruledDistinct: number;
	/** Flagged pairs no ruling covers: what the author would have to rule on. */
	unreviewed: CorpusEvalPair[];
	/** Merge rulings at or above the cutoff. */
	mergesCaught: number;
};

export type CorpusEvalReport = {
	merges: Array<{
		into: string;
		score: number;
		/** Pairs in today's corpus scoring higher. */
		outrankedBy: number;
	}>;
	/** Highest-scoring pair the author ruled distinct, if any is in today's corpus. */
	topRuledDistinct: CorpusEvalPair | null;
	/** At the model's cutoff. */
	atThreshold: CorpusEvalFlagged;
	/** At the highest two-decimal cutoff that still flags every merge ruling. */
	atCatchAll: CorpusEvalFlagged;
};

const round = (value: number): number => Math.round(value * 100) / 100;

const cosine = (a: ArrayLike<number>, b: ArrayLike<number>): number => {
	if (a.length !== b.length || a.length === 0) {
		throw new Error(
			`Cannot compare vectors of length ${a.length} and ${b.length}.`,
		);
	}
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i += 1) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	if (normA === 0 || normB === 0) return 0;
	return dot / Math.sqrt(normA * normB);
};

const pairKey = (a: string, b: string): string => [a, b].sort().join("\u0000");

export const evaluateCorpusModel = (
	input: CorpusEvalInput,
): CorpusEvalReport => {
	if (input.slugs.length !== input.vectors.length) {
		throw new Error(
			`Expected one vector per mechanism (${input.slugs.length}), got ${input.vectors.length}.`,
		);
	}
	if (input.merges.length === 0) {
		throw new Error("No merge rulings to score against.");
	}

	const pairs: CorpusEvalPair[] = [];
	for (let i = 0; i < input.slugs.length; i += 1) {
		for (let j = i + 1; j < input.slugs.length; j += 1) {
			pairs.push({
				a: input.slugs[i],
				b: input.slugs[j],
				score: cosine(input.vectors[i], input.vectors[j]),
			});
		}
	}
	pairs.sort((x, y) => y.score - x.score);

	const ruled = new Set(
		input.distinct.map((decision) => pairKey(...decision.pair)),
	);
	const isRuled = (pair: CorpusEvalPair) => ruled.has(pairKey(pair.a, pair.b));

	const merges = input.merges.map((merge) => {
		const score = cosine(merge.vectors[0], merge.vectors[1]);
		return {
			into: merge.into,
			score,
			outrankedBy: pairs.filter((pair) => pair.score > score).length,
		};
	});

	const flaggedAt = (cutoff: number): CorpusEvalFlagged => {
		const flagged = pairs.filter((pair) => pair.score >= cutoff);
		return {
			cutoff,
			flagged: flagged.length,
			ruledDistinct: flagged.filter(isRuled).length,
			unreviewed: flagged
				.filter((pair) => !isRuled(pair))
				.map((pair) => ({ ...pair, score: round(pair.score) })),
			mergesCaught: merges.filter((merge) => merge.score >= cutoff).length,
		};
	};

	const topRuled = pairs.find(isRuled) ?? null;
	const lowestMerge = Math.min(...merges.map((merge) => merge.score));

	return {
		merges: merges.map((merge) => ({ ...merge, score: round(merge.score) })),
		topRuledDistinct: topRuled
			? { ...topRuled, score: round(topRuled.score) }
			: null,
		atThreshold: flaggedAt(input.threshold),
		atCatchAll: flaggedAt(Math.floor(lowestMerge * 100) / 100),
	};
};

/** P(X >= k) for X ~ Binomial(n, p). */
const tailAtLeast = (k: number, n: number, p: number): number => {
	let total = 0;
	let term = (1 - p) ** n; // P(X = 0)
	for (let x = 0; x <= n; x += 1) {
		if (x >= k) total += term;
		term = (term * (n - x) * p) / ((x + 1) * (1 - p));
	}
	return total;
};

/**
 * The lowest rate consistent with `right` of `total` at 95% confidence (exact,
 * one-sided Clopper–Pearson): how far a perfect score on a small answer key
 * can be trusted. 3 of 3 says only "at least 36.8%"; 17 of 17, "at least 83.8%".
 */
export const lowerBound95 = (right: number, total: number): number => {
	if (total <= 0 || right <= 0) return 0;
	if (right >= total) return 0.05 ** (1 / total);
	let low = 0;
	let high = right / total;
	for (let step = 0; step < 60; step += 1) {
		const mid = (low + high) / 2;
		if (tailAtLeast(right, total, mid) < 0.05) low = mid;
		else high = mid;
	}
	return low;
};
