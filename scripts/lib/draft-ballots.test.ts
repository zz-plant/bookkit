import { describe, expect, it } from "bun:test";
import {
	type Ballot,
	decideDrafts,
	judgeDraftsPrompt,
	readBallot,
} from "./draft-ballots";

const ballot = (ranking: string[], reject: string[] = []): Ballot => ({
	ranking,
	reject: reject.map((id) => ({ id, why: `${id} breaks a rule` })),
	why: "",
});

describe("readBallot", () => {
	const ids = ["D1", "D2", "D3"];

	it("takes the JSON object out of a reply with prose around it", () => {
		expect(
			readBallot(
				'Here is my ballot:\n{"ranking":["D2","D1","D3"],"reject":[{"id":"D3","why":"Cites a study."}],"why":"D2 keeps to the claim."}\nThanks.',
				ids,
			),
		).toEqual({
			ranking: ["D2", "D1", "D3"],
			reject: [{ id: "D3", why: "Cites a study." }],
			why: "D2 keeps to the claim.",
		});
	});

	it("reads a rejection given as a bare id, and a ballot with none", () => {
		expect(
			readBallot('{"ranking":["D1","D2","D3"],"reject":["D2"]}', ids),
		).toEqual({
			ranking: ["D1", "D2", "D3"],
			reject: [{ id: "D2", why: "" }],
			why: "",
		});
		expect(readBallot('{"ranking":["D1","D2","D3"]}', ids)).toMatchObject({
			reject: [],
		});
	});

	it("refuses a ranking that leaves a draft out, repeats one, or names another", () => {
		expect(readBallot('{"ranking":["D1","D2"]}', ids)).toEqual({
			error: "ranking must list each of D1, D2, D3 once; missing D3",
		});
		expect(readBallot('{"ranking":["D1","D2","D3","D1"]}', ids)).toHaveProperty(
			"error",
		);
		expect(readBallot('{"ranking":["D1","D2","D3","D9"]}', ids)).toEqual({
			error: "ranking must list each of D1, D2, D3 once; D9 is not a draft",
		});
		expect(
			readBallot('{"ranking":["D1","D2","D3"],"reject":["D7"]}', ids),
		).toEqual({ error: "reject names D7, which is not a draft" });
		expect(readBallot("I cannot judge these.", ids)).toEqual({
			error: "the reply holds no JSON object",
		});
	});
});

describe("decideDrafts", () => {
	const ids = ["D1", "D2", "D3"];

	it("names the draft every judge ranks first", () => {
		expect(
			decideDrafts(ids, [
				ballot(["D2", "D1", "D3"]),
				ballot(["D2", "D3", "D1"]),
				ballot(["D2", "D1", "D3"]),
			]),
		).toEqual({
			call: "winner",
			winner: "D2",
			firsts: 3,
			judges: 3,
			rejected: [],
		});
	});

	it("names the draft most judges rank above each other one, even when first choices differ", () => {
		// D1 beats D2 two to one and D3 two to one, with one first place of three.
		expect(
			decideDrafts(ids, [
				ballot(["D1", "D2", "D3"]),
				ballot(["D2", "D1", "D3"]),
				ballot(["D3", "D1", "D2"]),
			]),
		).toMatchObject({ call: "winner", winner: "D1", firsts: 1, judges: 3 });
	});

	it("leaves a cycle to the author, most preferred first", () => {
		expect(
			decideDrafts(ids, [
				ballot(["D1", "D2", "D3"]),
				ballot(["D2", "D3", "D1"]),
				ballot(["D3", "D1", "D2"]),
			]),
		).toMatchObject({ call: "split", judges: 3 });
		// Two judges, two drafts, opposite orders: neither beats the other.
		expect(
			decideDrafts(["D1", "D2"], [ballot(["D1", "D2"]), ballot(["D2", "D1"])]),
		).toMatchObject({ call: "split", order: ["D1", "D2"] });
	});

	it("puts out a draft most judges reject, whatever its rank", () => {
		const decision = decideDrafts(ids, [
			ballot(["D1", "D2", "D3"], ["D1"]),
			ballot(["D1", "D2", "D3"], ["D1"]),
			ballot(["D1", "D2", "D3"]),
		]);
		expect(decision).toMatchObject({ call: "winner", winner: "D2", firsts: 3 });
		expect(decision.rejected).toEqual([
			{ id: "D1", by: 2, reasons: ["D1 breaks a rule", "D1 breaks a rule"] },
		]);
	});

	it("keeps a draft that only a minority rejects", () => {
		expect(
			decideDrafts(ids, [
				ballot(["D1", "D2", "D3"], ["D1"]),
				ballot(["D1", "D2", "D3"]),
				ballot(["D1", "D2", "D3"]),
			]),
		).toMatchObject({ call: "winner", winner: "D1", rejected: [] });
		// One of two is not most.
		expect(
			decideDrafts(["D1"], [ballot(["D1"], ["D1"]), ballot(["D1"])]),
		).toMatchObject({ call: "winner", winner: "D1" });
	});

	it("names no winner when every draft is out, or no judge has voted", () => {
		expect(
			decideDrafts(
				["D1", "D2"],
				[
					ballot(["D1", "D2"], ["D1", "D2"]),
					ballot(["D2", "D1"], ["D1", "D2"]),
				],
			),
		).toMatchObject({ call: "none", judges: 2 });
		expect(decideDrafts(ids, [])).toEqual({
			call: "none",
			judges: 0,
			rejected: [],
		});
	});
});

describe("judgeDraftsPrompt", () => {
	it("gives a judge the brief, each draft under its id, and no draft id in the example ballot", () => {
		const prompt = judgeDraftsPrompt("THE BRIEF", [
			{ id: "D1", source: "first draft" },
			{ id: "D2", source: "second draft" },
		]);
		expect(prompt).toContain("THE BRIEF");
		expect(prompt).toContain("## Draft D1\n\nfirst draft");
		expect(prompt).toContain("## Draft D2\n\nsecond draft");
		// An example that named real ids would be a ballot to copy.
		const example = prompt.split("\n").find((line) => line.startsWith("{"));
		expect(example).not.toMatch(/D\d/);
	});
});
