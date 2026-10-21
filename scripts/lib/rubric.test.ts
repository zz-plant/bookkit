import { describe, expect, it } from "bun:test";
import { buildRubric } from "./rubric";

const mechanism = (
	slug: string,
	book: string,
	definition = `${slug} text.`,
) => ({
	slug,
	book,
	title: slug,
	definition,
	is: [`${slug} applies`],
	isNot: [`${slug} does not`],
	predictions: [],
	tests: [`test for ${slug}`],
});

describe("buildRubric", () => {
	const mechanisms = [
		mechanism("delay", "one"),
		mechanism("delay", "two"),
		mechanism("queue", "two"),
		mechanism("draft", "two", " "),
	];
	const rulings = {
		distinct: [
			{
				pair: ["queue", "delay"] as [string, string],
				reason: "structure, not time",
			},
			{
				pair: ["queue", "gone"] as [string, string],
				reason: "not in this corpus",
			},
		],
		merged: [
			{
				into: "delay",
				date: "2026-10-07",
				reason: "same lever and evidence",
				before: [
					{
						book: "one",
						slug: "waiting",
						title: "Waiting",
						definition: "Old.",
						is: [],
					},
					{
						book: "two",
						slug: "delay",
						title: "Delay",
						definition: "Older.",
						is: [],
					},
				],
			},
		],
	};

	it("makes one criterion per mechanism with a definition, across its books", () => {
		const rubric = buildRubric(mechanisms, rulings);
		expect(rubric.criteria.map((c) => c.id)).toEqual(["delay", "queue"]);
		const delay = rubric.criteria[0];
		expect(delay.books).toEqual(["one", "two"]);
		expect(delay.appliesWhen).toEqual(["delay applies"]);
		expect(delay.notWhen).toEqual(["delay does not"]);
		expect(delay.distinctFrom).toEqual([
			{ id: "queue", reason: "structure, not time" },
		]);
		expect(delay.mergedFrom).toEqual([
			{ id: "waiting", date: "2026-10-07", reason: "same lever and evidence" },
		]);
		expect(rubric.rule).toStartWith("Combine two mechanisms only if");
	});

	it("labels the rulings in the corpus as pairs, merges as they read before", () => {
		const { pairs } = buildRubric(mechanisms, rulings);
		expect(pairs.map((p) => [p.label, p.a.id, p.b.id])).toEqual([
			["same_idea", "waiting", "delay"],
			["distinct", "queue", "delay"],
		]);
		expect(pairs[0].a.definition).toBe("Old.");
	});

	it("changes version only when a criterion's text does", () => {
		const a = buildRubric(mechanisms, rulings).version;
		expect(buildRubric([...mechanisms].reverse(), rulings).version).toBe(a);
		const edited = [
			mechanism("delay", "one", "New text."),
			...mechanisms.slice(1),
		];
		expect(buildRubric(edited, rulings).version).not.toBe(a);
	});
});
