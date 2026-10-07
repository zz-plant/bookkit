import {
	DEFAULT_LEXICAL_OVERLAP_THRESHOLD,
	lexicalMechanismSimilarity,
	type MechanismRecord,
} from "./mechanism-overlap";
import type { ContentSuggestion } from "./types";

/**
 * Corpus overlap: the mechanism-overlap check run across several books at
 * once, because one author's books can name the same idea twice without any
 * single book noticing. Lexical similarity alone misses most of these (the
 * books describe the same mechanism in different words), so callers may pass
 * one embedding vector per mechanism for a semantic pass. Vectors are
 * injected so the engine never loads a model itself.
 */

export type CorpusMechanism = MechanismRecord & { book: string };

export type CorpusPair = {
	/** `book/slug` of each side. */
	a: string;
	b: string;
	crossBook: boolean;
	lexical: number;
	semantic: number | null;
	sharedBoundaryPhrases: string[];
	flaggedBy: Array<"lexical" | "semantic">;
};

export type CorpusCluster = {
	/** `book/slug` ids, strongest-connected first. */
	members: string[];
	books: string[];
	pairs: CorpusPair[];
	strongest: CorpusPair;
};

export type CorpusOverlapOptions = {
	/** One vector per mechanism, in the same order. Omit for a lexical-only pass. */
	vectors?: ReadonlyArray<ArrayLike<number>> | null;
	/** Cosine similarity at or above which a pair is flagged. */
	semanticThreshold?: number;
	/** Combined lexical similarity at or above which a pair is flagged. */
	lexicalThreshold?: number;
};

export type CorpusOverlapReport = {
	books: string[];
	mechanismCount: number;
	semantic: boolean;
	pairs: CorpusPair[];
	clusters: CorpusCluster[];
	/** Mechanism count if every cluster were folded into one mechanism. */
	countIfMerged: number;
	suggestions: ContentSuggestion[];
};

/** Calibrated on all-MiniLM-L6-v2 over the corpusEmbeddingText of 33 real mechanisms. */
export const DEFAULT_SEMANTIC_OVERLAP_THRESHOLD = 0.45;

/** What a semantic model should read for one mechanism: its name, definition, and what it covers. */
export const corpusEmbeddingText = (mechanism: MechanismRecord): string =>
	[`${mechanism.title}.`, mechanism.definition, ...mechanism.is]
		.join(" ")
		.trim();

export const corpusMechanismId = (mechanism: CorpusMechanism): string =>
	`${mechanism.book}/${mechanism.slug}`;

const round = (value: number): number => Math.round(value * 100) / 100;

const cosine = (a: ArrayLike<number>, b: ArrayLike<number>): number => {
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	if (normA === 0 || normB === 0) return 0;
	return dot / Math.sqrt(normA * normB);
};

const pairStrength = (pair: CorpusPair): number =>
	Math.max(pair.semantic ?? 0, pair.lexical);

export const analyzeCorpusOverlap = (
	mechanisms: CorpusMechanism[],
	options: CorpusOverlapOptions = {},
): CorpusOverlapReport => {
	const vectors = options.vectors ?? null;
	if (vectors && vectors.length !== mechanisms.length) {
		throw new Error(
			`analyzeCorpusOverlap: got ${vectors.length} vectors for ${mechanisms.length} mechanisms; pass one vector per mechanism in the same order.`,
		);
	}
	const semanticThreshold =
		options.semanticThreshold ?? DEFAULT_SEMANTIC_OVERLAP_THRESHOLD;
	const lexicalThreshold =
		options.lexicalThreshold ?? DEFAULT_LEXICAL_OVERLAP_THRESHOLD;
	const ids = mechanisms.map(corpusMechanismId);

	const pairs: CorpusPair[] = [];
	for (let i = 0; i < mechanisms.length; i += 1) {
		for (let j = i + 1; j < mechanisms.length; j += 1) {
			const lexical = lexicalMechanismSimilarity(mechanisms[i], mechanisms[j]);
			const semantic = vectors ? cosine(vectors[i], vectors[j]) : null;
			const flaggedBy: CorpusPair["flaggedBy"] = [];
			if (
				lexical.combined >= lexicalThreshold ||
				lexical.sharedBoundaryPhrases.length > 0
			) {
				flaggedBy.push("lexical");
			}
			if (semantic !== null && semantic >= semanticThreshold) {
				flaggedBy.push("semantic");
			}
			if (flaggedBy.length === 0) continue;
			pairs.push({
				a: ids[i],
				b: ids[j],
				crossBook: mechanisms[i].book !== mechanisms[j].book,
				lexical: round(lexical.combined),
				semantic: semantic === null ? null : round(semantic),
				sharedBoundaryPhrases: lexical.sharedBoundaryPhrases,
				flaggedBy,
			});
		}
	}
	pairs.sort((x, y) => pairStrength(y) - pairStrength(x));

	// Union-find over flagged pairs: each connected group is one candidate idea.
	const parent = new Map(ids.map((id) => [id, id]));
	const find = (id: string): string => {
		let root = id;
		while (parent.get(root) !== root) root = parent.get(root) ?? root;
		parent.set(id, root);
		return root;
	};
	for (const pair of pairs) parent.set(find(pair.a), find(pair.b));

	const groups = new Map<string, CorpusPair[]>();
	for (const pair of pairs) {
		const root = find(pair.a);
		groups.set(root, [...(groups.get(root) ?? []), pair]);
	}

	const bookOf = new Map(mechanisms.map((m) => [corpusMechanismId(m), m.book]));
	const clusters: CorpusCluster[] = [...groups.values()].map((clusterPairs) => {
		const members: string[] = [];
		for (const pair of clusterPairs) {
			for (const id of [pair.a, pair.b]) {
				if (!members.includes(id)) members.push(id);
			}
		}
		const books = [...new Set(members.map((id) => bookOf.get(id) ?? ""))];
		return { members, books, pairs: clusterPairs, strongest: clusterPairs[0] };
	});
	clusters.sort(
		(x, y) =>
			y.members.length - x.members.length ||
			pairStrength(y.strongest) - pairStrength(x.strongest),
	);

	const clusteredCount = clusters.reduce((n, c) => n + c.members.length, 0);
	const titleOf = new Map(
		mechanisms.map((m) => [corpusMechanismId(m), m.title]),
	);
	const fileOf = new Map(mechanisms.map((m) => [corpusMechanismId(m), m.file]));

	const suggestions: ContentSuggestion[] = clusters.map((cluster) => {
		const names = cluster.members
			.map((id) => `${titleOf.get(id) ?? id} (${id})`)
			.join(", ");
		const across =
			cluster.books.length > 1
				? `across ${cluster.books.join(", ")}`
				: `in ${cluster.books[0]}`;
		return {
			category: "corpus-overlap",
			severity: "advisory",
			book: cluster.books.join("+"),
			file: fileOf.get(cluster.members[0]) ?? cluster.members[0],
			message: `${cluster.members.length} mechanisms ${across} may name one idea: ${names}.`,
			nextAction:
				"Decide whether these are one mechanism. If one, keep a single slug and repoint chapters, tools, examples, and glossary entries to it (a breaking change for any book that used the others). If distinct, sharpen each is/isNot so it explicitly excludes the others.",
			evidence: {
				members: cluster.members,
				books: cluster.books,
				pairs: cluster.pairs,
			},
		};
	});

	return {
		books: [...new Set(mechanisms.map((m) => m.book))],
		mechanismCount: mechanisms.length,
		semantic: vectors !== null,
		pairs,
		clusters,
		countIfMerged: mechanisms.length - clusteredCount + clusters.length,
		suggestions,
	};
};
