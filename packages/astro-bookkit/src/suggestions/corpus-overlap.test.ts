import { describe, expect, it } from "bun:test";
import {
	analyzeCorpusOverlap,
	type CorpusMechanism,
	corpusEmbeddingText,
} from "./corpus-overlap";

const mechanism = (
	book: string,
	slug: string,
	definition: string,
	extra: Partial<CorpusMechanism> = {},
): CorpusMechanism => ({
	book,
	slug,
	title: slug.replace(/-/g, " "),
	definition,
	is: [],
	isNot: [],
	predictions: [],
	tests: [],
	file: `${book}/${slug}.mdx`,
	...extra,
});

// Unit vectors: same direction = cosine 1, orthogonal = cosine 0.
const unit = (...values: number[]) => {
	const norm = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0));
	return values.map((v) => v / norm);
};

describe("corpus overlap", () => {
	it("clusters mechanisms from different books that the semantic pass ties together", () => {
		const mechanisms = [
			mechanism(
				"book-a",
				"coercive-waiting",
				"Delays exhaust options and coerce agreement.",
			),
			mechanism(
				"book-b",
				"delay-as-force",
				"Elapsed time is weaponized to reduce claims.",
			),
			mechanism(
				"book-b",
				"documentation-tollbooth",
				"Access depends on re-producing documents.",
			),
		];
		const report = analyzeCorpusOverlap(mechanisms, {
			vectors: [unit(1, 0.1, 0), unit(1, 0.2, 0), unit(0, 0, 1)],
		});

		expect(report.semantic).toBe(true);
		expect(report.books).toEqual(["book-a", "book-b"]);
		expect(report.pairs).toHaveLength(1);
		expect(report.pairs[0]).toMatchObject({
			a: "book-a/coercive-waiting",
			b: "book-b/delay-as-force",
			crossBook: true,
			flaggedBy: ["semantic"],
		});
		expect(report.clusters).toHaveLength(1);
		expect(report.clusters[0].members).toEqual([
			"book-a/coercive-waiting",
			"book-b/delay-as-force",
		]);
		expect(report.countIfMerged).toBe(2);
		expect(report.suggestions[0].category).toBe("corpus-overlap");
		expect(report.suggestions[0].message).toContain("across book-a, book-b");
	});

	it("chains pairs into one cluster and leaves unrelated mechanisms out", () => {
		const mechanisms = [
			mechanism("a", "one", "First."),
			mechanism("b", "two", "Second."),
			mechanism("c", "three", "Third."),
			mechanism("c", "four", "Fourth."),
		];
		const report = analyzeCorpusOverlap(mechanisms, {
			vectors: [unit(1, 0, 0), unit(1, 0.9, 0), unit(0, 1, 0), unit(0, 0, 1)],
			semanticThreshold: 0.6,
		});

		expect(report.clusters).toHaveLength(1);
		expect(report.clusters[0].members.sort()).toEqual([
			"a/one",
			"b/two",
			"c/three",
		]);
		expect(report.clusters[0].books.sort()).toEqual(["a", "b", "c"]);
		expect(report.countIfMerged).toBe(2);
	});

	it("still flags lexical duplicates when no vectors are given", () => {
		const shared = {
			is: ["Waiting used to exhaust options"],
			isNot: ["Queues with published service levels"],
		};
		const report = analyzeCorpusOverlap([
			mechanism(
				"a",
				"coercive-waiting",
				"Waiting used to exhaust options and coerce agreement.",
				shared,
			),
			mechanism(
				"b",
				"forced-waiting",
				"Waiting used to exhaust options and coerce agreement.",
				shared,
			),
		]);

		expect(report.semantic).toBe(false);
		expect(report.pairs[0].semantic).toBeNull();
		expect(report.pairs[0].flaggedBy).toEqual(["lexical"]);
		expect(report.clusters).toHaveLength(1);
	});

	it("rejects a vector list that does not line up with the mechanisms", () => {
		expect(() =>
			analyzeCorpusOverlap(
				[mechanism("a", "one", "First."), mechanism("b", "two", "Second.")],
				{
					vectors: [unit(1, 0)],
				},
			),
		).toThrow("one vector per mechanism");
	});

	it("embeds the title, definition, and is list but not isNot", () => {
		const text = corpusEmbeddingText(
			mechanism("a", "delay-as-force", "Elapsed time is weaponized.", {
				title: "Delay as force",
				is: ["Review loops that add burden"],
				isNot: ["Batching with published timelines"],
			}),
		);

		expect(text).toBe(
			"Delay as force. Elapsed time is weaponized. Review loops that add burden",
		);
	});
});
