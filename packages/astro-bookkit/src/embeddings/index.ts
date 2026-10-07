export type EmbeddingVector = number[];

export const cosineSimilarity = (
	a: EmbeddingVector,
	b: EmbeddingVector,
): number => {
	let dot = 0;
	let normA = 0;
	let normB = 0;
	const len = Math.min(a.length, b.length);
	for (let i = 0; i < len; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	const denom = Math.sqrt(normA) * Math.sqrt(normB);
	return denom === 0 ? 0 : dot / denom;
};

export const topKByScore = <T>(
	items: T[],
	scoreFn: (item: T) => number,
	k: number,
): Array<{ item: T; score: number }> => {
	const scored = items.map((item) => ({ item, score: scoreFn(item) }));
	scored.sort((a, b) => b.score - a.score);
	return scored.slice(0, k);
};
