import { describe, expect, it } from "bun:test";
import { evaluateCorpusModel } from "./corpus-eval";

// Angles on a circle: cosine between two of them is cos(difference).
const at = (degrees: number) => {
	const radians = (degrees * Math.PI) / 180;
	return [Math.cos(radians), Math.sin(radians)];
};

const slugs = ["a", "b", "c"];
// a~b cos(10°) ≈ 0.98, b~c cos(50°) ≈ 0.64, a~c cos(60°) = 0.5
const vectors = [at(0), at(10), at(60)];

describe("evaluateCorpusModel", () => {
	it("ranks each merge against today's pairs", () => {
		const report = evaluateCorpusModel({
			slugs,
			vectors,
			// cos(30°) ≈ 0.87: only a~b scores higher
			merges: [{ into: "x", vectors: [at(0), at(30)] }],
			distinct: [],
			threshold: 0.9,
		});
		expect(report.merges).toEqual([{ into: "x", score: 0.87, outrankedBy: 1 }]);
	});

	it("separates ruled-distinct from unreviewed flags at the model's cutoff", () => {
		const report = evaluateCorpusModel({
			slugs,
			vectors,
			merges: [{ into: "x", vectors: [at(0), at(30)] }],
			distinct: [{ pair: ["b", "a"], reason: "ruled" }],
			threshold: 0.6,
		});
		expect(report.topRuledDistinct).toEqual({ a: "a", b: "b", score: 0.98 });
		expect(report.atThreshold).toEqual({
			cutoff: 0.6,
			flagged: 2,
			ruledDistinct: 1,
			unreviewed: [{ a: "b", b: "c", score: 0.64 }],
			mergesCaught: 1,
		});
	});

	it("reports the highest two-decimal cutoff that still catches every merge", () => {
		const report = evaluateCorpusModel({
			slugs,
			vectors,
			merges: [
				{ into: "x", vectors: [at(0), at(30)] },
				// cos(55°) ≈ 0.574
				{ into: "y", vectors: [at(0), at(55)] },
			],
			distinct: [],
			threshold: 0.9,
		});
		expect(report.atThreshold.mergesCaught).toBe(0);
		expect(report.atCatchAll.cutoff).toBe(0.57);
		expect(report.atCatchAll.mergesCaught).toBe(2);
		expect(report.atCatchAll.flagged).toBe(2);
	});

	it("rejects mismatched inputs instead of scoring them", () => {
		expect(() =>
			evaluateCorpusModel({
				slugs,
				vectors: vectors.slice(0, 2),
				merges: [{ into: "x", vectors: [at(0), at(30)] }],
				distinct: [],
				threshold: 0.5,
			}),
		).toThrow("one vector per mechanism");
		expect(() =>
			evaluateCorpusModel({
				slugs,
				vectors,
				merges: [{ into: "x", vectors: [at(0), [1, 0, 0]] }],
				distinct: [],
				threshold: 0.5,
			}),
		).toThrow("Cannot compare vectors");
		expect(() =>
			evaluateCorpusModel({
				slugs,
				vectors,
				merges: [],
				distinct: [],
				threshold: 0.5,
			}),
		).toThrow("No merge rulings");
	});
});
