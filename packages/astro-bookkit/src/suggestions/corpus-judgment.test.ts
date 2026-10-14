import { describe, expect, it } from "bun:test";
import {
	decidePair,
	describeCall,
	evaluateJudgments,
	type JudgeVote,
	judgmentScore,
	RELATION_DRAFTS,
} from "./corpus-judgment";
import { analyzeCorpusOverlap, type CorpusMechanism } from "./corpus-overlap";

const vote = (
	relation: JudgeVote["relation"],
	sameLever = 0.5,
	sameEvidence = 0.5,
): JudgeVote => ({ relation, sameLever, sameEvidence });

describe("decidePair", () => {
	it("calls the same idea only when every judge does", () => {
		expect(
			decidePair([
				vote("same_idea", 0.87, 0.78),
				vote("same_idea", 0.8, 0.7),
				vote("same_idea", 0.9, 0.85),
			]),
		).toEqual({ call: "same-idea", votes: 3, score: 0.67 });
	});

	it("leaves a split to the author, naming the other answers", () => {
		// crumple-zone ~ death-of-slack in the 2026-10-14 run, ruled distinct.
		const call = decidePair([
			vote("cause_effect", 0.5, 0.5),
			vote("same_idea", 0.6, 0.55),
			vote("cause_effect", 0.5, 0.5),
		]);
		expect(call).toMatchObject({
			call: "split",
			sameIdea: 1,
			votes: 3,
			others: ["cause_effect"],
		});
		expect(call && describeCall(call)).toBe(
			"judges split: same idea 1 of 3, otherwise cause and effect (lever and evidence 0.28)",
		);
	});

	it("drafts a distinct ruling from the most common relation", () => {
		const call = decidePair([
			vote("same_family", 0.2, 0.1),
			vote("before_after", 0.1, 0.1),
			vote("before_after", 0.1, 0.2),
		]);
		expect(call).toEqual({
			call: "distinct",
			votes: 3,
			score: 0.02,
			relation: "before_after",
			draft: RELATION_DRAFTS.before_after,
		});
	});

	it("breaks a tie between relations in the prompt's order", () => {
		expect(decidePair([vote("unrelated"), vote("cause_effect")])).toMatchObject(
			{ relation: "cause_effect" },
		);
	});

	it("has no call without votes", () => {
		expect(decidePair([])).toBeNull();
		expect(judgmentScore([])).toBe(0);
	});
});

describe("evaluateJudgments", () => {
	const merge = (score: number) => [
		vote("same_idea", score, 1),
		vote("same_idea", score, 1),
	];
	const distinct = (score: number, relation: JudgeVote["relation"]) => [
		vote(relation, score, 1),
		vote("same_family", score, 1),
	];

	it("counts the table's right, wrong, and split calls, and the score cutoff left one out", () => {
		const result = evaluateJudgments([
			{ pair: ["m1", "m2"], ruled: "merge", votes: merge(0.7) },
			{ pair: ["m3", "m4"], ruled: "merge", votes: merge(0.4) },
			{
				pair: ["d1", "d2"],
				ruled: "distinct",
				votes: distinct(0.3, "same_family"),
			},
			// Split: left to the author, not counted wrong.
			{
				pair: ["d3", "d4"],
				ruled: "distinct",
				votes: distinct(0.1, "same_idea"),
			},
			// The table calls it the same idea; the author ruled it distinct.
			{ pair: ["d5", "d6"], ruled: "distinct", votes: merge(0.2) },
			{ pair: ["d7", "d8"], ruled: "distinct", votes: [] },
		]);
		expect(result.scored).toBe(5);
		expect(result.unjudged).toEqual([["d7", "d8"]]);
		expect(result.table.right).toBe(3);
		expect(result.table.left.map((miss) => miss.pair)).toEqual([["d3", "d4"]]);
		expect(result.table.wrong.map((miss) => miss.pair)).toEqual([["d5", "d6"]]);
		// Held out, m3 (0.4) sits below the cutoff from the rest: (0.7 + 0.3) / 2.
		expect(result.scoreCutoff.wrong.map((miss) => miss.pair)).toEqual([
			["m3", "m4"],
		]);
		expect(result.scoreCutoff.right).toBe(4);
	});
});

describe("analyzeCorpusOverlap with judgments", () => {
	const mechanism = (
		slug: string,
		book: string,
		definition: string,
	): CorpusMechanism => ({
		slug,
		title: slug,
		definition,
		is: [],
		isNot: [],
		predictions: [],
		tests: [],
		book,
	});
	const mechanisms = [
		mechanism("waiting-game", "one", "Stalling until the other side quits."),
		mechanism("slow-walk", "two", "Moving paperwork at a crawl on purpose."),
		mechanism("tidy-desk", "two", "Filing everything by colour."),
	];

	it("flags a pair the judges called the same idea, though its wording differs", () => {
		const report = analyzeCorpusOverlap(mechanisms, {
			judgments: [
				{
					pair: ["slow-walk", "waiting-game"],
					votes: [vote("same_idea", 0.8, 0.8), vote("same_idea", 0.7, 0.9)],
				},
			],
		});
		expect(report.clusters).toHaveLength(1);
		expect(report.clusters[0].strongest).toMatchObject({
			a: "waiting-game",
			b: "slow-walk",
			flaggedBy: ["judged"],
			judged: { call: "same-idea", votes: 2 },
		});
	});

	it("does not flag a pair the judges ruled out, and a ruling still resolves a judged pair", () => {
		const judgments = [
			{
				pair: ["tidy-desk", "waiting-game"] as [string, string],
				votes: [vote("unrelated", 0, 0)],
			},
			{
				pair: ["slow-walk", "waiting-game"] as [string, string],
				votes: [vote("same_idea"), vote("same_family")],
			},
		];
		expect(analyzeCorpusOverlap(mechanisms, { judgments }).pairs).toEqual([
			expect.objectContaining({ a: "waiting-game", b: "slow-walk" }),
		]);
		const ruled = analyzeCorpusOverlap(mechanisms, {
			judgments,
			distinct: [
				{ pair: ["waiting-game", "slow-walk"], reason: "Different levers." },
			],
		});
		expect(ruled.clusters).toEqual([]);
		expect(ruled.reviewedDistinct).toHaveLength(1);
	});
});
