const STOPWORDS = new Set([
	"the",
	"a",
	"an",
	"and",
	"or",
	"but",
	"for",
	"nor",
	"yet",
	"so",
	"of",
	"in",
	"on",
	"at",
	"to",
	"from",
	"by",
	"with",
	"without",
	"into",
	"onto",
	"over",
	"under",
	"about",
	"that",
	"this",
	"these",
	"those",
	"it",
	"is",
	"are",
	"was",
	"were",
	"be",
	"been",
	"being",
	"has",
	"have",
	"had",
	"do",
	"does",
	"did",
	"will",
	"would",
	"can",
	"could",
	"should",
	"may",
	"might",
	"must",
	"as",
	"if",
	"then",
	"than",
	"when",
	"which",
	"who",
	"whom",
	"whose",
	"what",
	"your",
	"you",
	"they",
	"their",
	"them",
	"we",
	"our",
	"us",
	"he",
	"she",
	"his",
	"her",
	"its",
	"not",
	"no",
	"very",
	"just",
	"only",
	"more",
	"most",
	"also",
	"too",
	"often",
	"there",
	"here",
	"some",
	"any",
	"each",
	"every",
	"both",
	"all",
	"one",
	"two",
	"new",
	"want",
]);

export const normalizeText = (value: string): string =>
	value
		.toLowerCase()
		.replace(/[^a-z0-9\s'-]/g, " ")
		.replace(/\s+/g, " ")
		.trim();

export const normalizePhrases = (phrases: string[]): string[] =>
	phrases.map((phrase) => normalizeText(phrase)).filter(Boolean);

export const tokenize = (value: string): string[] => {
	const seen = new Set<string>();
	const unique: string[] = [];
	for (const raw of normalizeText(value).split(/\s+/)) {
		if (!raw) continue;
		const word = raw.replace(/^[-'"]+|[-'"]+$/g, "").replaceAll("'", "");
		if (!word || word.length <= 2 || STOPWORDS.has(word)) continue;
		if (seen.has(word)) continue;
		seen.add(word);
		unique.push(word);
	}
	return unique;
};

export const jaccard = (a: string[], b: string[]): number => {
	const setA = new Set(a);
	const setB = new Set(b);
	if (setA.size === 0 && setB.size === 0) return 0;
	let intersection = 0;
	for (const item of setA) if (setB.has(item)) intersection += 1;
	const union = setA.size + setB.size - intersection;
	return union === 0 ? 0 : intersection / union;
};

export const overlapRatio = (a: string[], b: string[]): number => {
	if (a.length === 0) return 0;
	const setB = new Set(b);
	let shared = 0;
	for (const item of a) if (setB.has(item)) shared += 1;
	return shared / a.length;
};

export const sharedPhrases = (a: string[], b: string[]): string[] => {
	const setA = new Set(a);
	return b.filter((phrase) => setA.has(phrase));
};
