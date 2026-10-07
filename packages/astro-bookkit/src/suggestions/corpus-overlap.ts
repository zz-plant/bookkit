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
 *
 * Within a corpus a slug names one mechanism. Books that share a mechanism
 * carry a copy under the same slug; copies must keep the same contract, and a
 * copy that drifts is reported. Pairs the author has reviewed and judged
 * distinct are passed in as decisions and stop being flagged.
 */

export type CorpusMechanism = MechanismRecord & { book: string };

/** An author's ruling that two flagged mechanisms are distinct ideas. */
export type CorpusDistinctDecision = {
	pair: [string, string];
	reason: string;
};

export type CorpusPair = {
	/** Slugs of each side. */
	a: string;
	b: string;
	crossBook: boolean;
	lexical: number;
	semantic: number | null;
	sharedBoundaryPhrases: string[];
	flaggedBy: Array<"lexical" | "semantic">;
};

export type CorpusCluster = {
	/** Slugs, strongest-connected first. */
	members: string[];
	books: string[];
	pairs: CorpusPair[];
	strongest: CorpusPair;
};

/** A slug carried by more than one book. */
export type CorpusSharedMechanism = {
	slug: string;
	books: string[];
	/** Contract fields whose values differ between the copies; empty when they agree. */
	driftedFields: string[];
};

export type CorpusOverlapOptions = {
	/** One vector per mechanism, in the same order. Omit for a lexical-only pass. */
	vectors?: ReadonlyArray<ArrayLike<number>> | null;
	/** Cosine similarity at or above which a pair is flagged. */
	semanticThreshold?: number;
	/** Combined lexical similarity at or above which a pair is flagged. */
	lexicalThreshold?: number;
	/** Pairs the author reviewed and ruled distinct; they are not flagged. */
	distinct?: CorpusDistinctDecision[];
};

export type CorpusOverlapReport = {
	books: string[];
	/** Distinct mechanisms, counting a shared slug once. */
	mechanismCount: number;
	semantic: boolean;
	pairs: CorpusPair[];
	clusters: CorpusCluster[];
	/** Mechanism count if every cluster were folded into one mechanism. */
	countIfMerged: number;
	shared: CorpusSharedMechanism[];
	/** Flagged pairs left out because a decision rules them distinct. */
	reviewedDistinct: CorpusDistinctDecision[];
	/** Decisions naming a slug the corpus no longer has. */
	staleDecisions: CorpusDistinctDecision[];
	suggestions: ContentSuggestion[];
};

/** Calibrated on all-MiniLM-L6-v2 over the corpusEmbeddingText of 33 real mechanisms. */
export const DEFAULT_SEMANTIC_OVERLAP_THRESHOLD = 0.45;

const CONTRACT_FIELDS = [
	"title",
	"definition",
	"is",
	"isNot",
	"predictions",
	"tests",
	"satisfies",
] as const;

/** What a semantic model should read for one mechanism: its name, definition, and what it covers. */
export const corpusEmbeddingText = (mechanism: MechanismRecord): string =>
	[`${mechanism.title}.`, mechanism.definition, ...mechanism.is]
		.join(" ")
		.trim();

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

const pairKey = (a: string, b: string): string => [a, b].sort().join("\u0000");

const driftedFields = (a: MechanismRecord, b: MechanismRecord): string[] =>
	CONTRACT_FIELDS.filter(
		(field) =>
			JSON.stringify(a[field] ?? null) !== JSON.stringify(b[field] ?? null),
	);

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

	// One entry per slug; the first copy stands for the mechanism.
	const entries: Array<{
		index: number;
		mechanism: CorpusMechanism;
		books: string[];
	}> = [];
	const entryBySlug = new Map<string, (typeof entries)[number]>();
	const shared = new Map<string, CorpusSharedMechanism>();
	mechanisms.forEach((mechanism, index) => {
		const existing = entryBySlug.get(mechanism.slug);
		if (!existing) {
			const entry = { index, mechanism, books: [mechanism.book] };
			entries.push(entry);
			entryBySlug.set(mechanism.slug, entry);
			return;
		}
		if (!existing.books.includes(mechanism.book))
			existing.books.push(mechanism.book);
		const record = shared.get(mechanism.slug) ?? {
			slug: mechanism.slug,
			books: existing.books,
			driftedFields: [],
		};
		for (const field of driftedFields(existing.mechanism, mechanism)) {
			if (!record.driftedFields.includes(field))
				record.driftedFields.push(field);
		}
		shared.set(mechanism.slug, record);
	});

	const decisions = options.distinct ?? [];
	const decided = new Map(
		decisions.map((decision) => [pairKey(...decision.pair), decision]),
	);
	const staleDecisions = decisions.filter(
		(decision) => !decision.pair.every((slug) => entryBySlug.has(slug)),
	);
	const reviewedDistinct: CorpusDistinctDecision[] = [];

	const pairs: CorpusPair[] = [];
	for (let i = 0; i < entries.length; i += 1) {
		for (let j = i + 1; j < entries.length; j += 1) {
			const left = entries[i];
			const right = entries[j];
			const lexical = lexicalMechanismSimilarity(
				left.mechanism,
				right.mechanism,
			);
			const semantic = vectors
				? cosine(vectors[left.index], vectors[right.index])
				: null;
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
			const decision = decided.get(
				pairKey(left.mechanism.slug, right.mechanism.slug),
			);
			if (decision) {
				reviewedDistinct.push(decision);
				continue;
			}
			pairs.push({
				a: left.mechanism.slug,
				b: right.mechanism.slug,
				crossBook: !left.books.some((book) => right.books.includes(book)),
				lexical: round(lexical.combined),
				semantic: semantic === null ? null : round(semantic),
				sharedBoundaryPhrases: lexical.sharedBoundaryPhrases,
				flaggedBy,
			});
		}
	}
	pairs.sort((x, y) => pairStrength(y) - pairStrength(x));

	// Union-find over flagged pairs: each connected group is one candidate idea.
	const parent = new Map(
		entries.map((entry) => [entry.mechanism.slug, entry.mechanism.slug]),
	);
	const find = (slug: string): string => {
		let root = slug;
		while (parent.get(root) !== root) root = parent.get(root) ?? root;
		parent.set(slug, root);
		return root;
	};
	for (const pair of pairs) parent.set(find(pair.a), find(pair.b));

	const groups = new Map<string, CorpusPair[]>();
	for (const pair of pairs) {
		const root = find(pair.a);
		groups.set(root, [...(groups.get(root) ?? []), pair]);
	}

	const clusters: CorpusCluster[] = [...groups.values()].map((clusterPairs) => {
		const members: string[] = [];
		for (const pair of clusterPairs) {
			for (const slug of [pair.a, pair.b]) {
				if (!members.includes(slug)) members.push(slug);
			}
		}
		const books = [
			...new Set(members.flatMap((slug) => entryBySlug.get(slug)?.books ?? [])),
		];
		return { members, books, pairs: clusterPairs, strongest: clusterPairs[0] };
	});
	clusters.sort(
		(x, y) =>
			y.members.length - x.members.length ||
			pairStrength(y.strongest) - pairStrength(x.strongest),
	);

	const label = (slug: string): string => {
		const entry = entryBySlug.get(slug);
		return `${entry?.mechanism.title ?? slug} (${slug}, ${entry?.books.join("+") ?? "?"})`;
	};

	const clusterSuggestions: ContentSuggestion[] = clusters.map((cluster) => ({
		category: "corpus-overlap",
		severity: "advisory",
		book: cluster.books.join("+"),
		file:
			entryBySlug.get(cluster.members[0])?.mechanism.file ?? cluster.members[0],
		message: `${cluster.members.length} mechanisms ${cluster.books.length > 1 ? `across ${cluster.books.join(", ")}` : `in ${cluster.books[0]}`} may name one idea: ${cluster.members.map(label).join(", ")}.`,
		nextAction:
			"Decide whether these are one mechanism. If one, give every book that uses it the same slug and contract, and repoint chapters, tools, examples, and glossary entries (a breaking change for books that used the other slug). If distinct, record the pair as distinct with a reason, and sharpen each is/isNot if the boundary is unclear.",
		evidence: {
			members: cluster.members,
			books: cluster.books,
			pairs: cluster.pairs,
		},
	}));

	const sharedList = [...shared.values()];
	const driftSuggestions: ContentSuggestion[] = sharedList
		.filter((record) => record.driftedFields.length > 0)
		.map((record) => ({
			category: "corpus-overlap",
			severity: "warning",
			book: record.books.join("+"),
			file: entryBySlug.get(record.slug)?.mechanism.file ?? record.slug,
			message: `Mechanism "${record.slug}" is shared by ${record.books.join(", ")} but its copies differ in: ${record.driftedFields.join(", ")}.`,
			nextAction:
				"A slug names one mechanism across the corpus. Make the copies' contracts identical, or give the books different slugs if they mean different things.",
			evidence: record,
		}));

	const staleSuggestions: ContentSuggestion[] = staleDecisions.map(
		(decision) => ({
			category: "corpus-overlap",
			severity: "advisory",
			book: "corpus",
			message: `A distinct decision names a mechanism the corpus no longer has: ${decision.pair.join(" ~ ")}.`,
			nextAction: "Remove the decision, or update it to the slugs now in use.",
			evidence: decision,
		}),
	);

	const clusteredCount = clusters.reduce((n, c) => n + c.members.length, 0);
	return {
		books: [...new Set(mechanisms.map((m) => m.book))],
		mechanismCount: entries.length,
		semantic: vectors !== null,
		pairs,
		clusters,
		countIfMerged: entries.length - clusteredCount + clusters.length,
		shared: sharedList,
		reviewedDistinct,
		staleDecisions,
		suggestions: [
			...driftSuggestions,
			...clusterSuggestions,
			...staleSuggestions,
		],
	};
};
