import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../_lib";
import { betNote, daysPastKillBy, outOfBet, parseBet } from "./bet-scope";

const bet = parseBet({
	bet: {
		id: "B9",
		killBy: "2026-11-04",
		isNot: [
			{ what: "reader UI", paths: ["packages/astro-bookkit/src/styles/"] },
			{ what: "MCP work", paths: ["scripts/mcp-server.ts"] },
			{ what: "no paths", paths: [] },
		],
	},
});
if (!bet) throw new Error("fixture bet did not parse");

describe("parseBet", () => {
	it("reads no bet from a corpus that names none", () => {
		expect(parseBet({ books: [] })).toBeNull();
		expect(parseBet({ bet: { since: "2026-10-07" } })).toBeNull();
	});

	it("drops an exclusion with no paths, which could match nothing", () => {
		expect(bet.isNot.map((entry) => entry.what)).toEqual([
			"reader UI",
			"MCP work",
		]);
	});

	it("reads this repository's bet, whose excluded paths exist", () => {
		const real = parseBet(
			JSON.parse(readFileSync(join(repoRoot(), "corpus.json"), "utf8")),
		);
		expect(real?.id).toBeTruthy();
		for (const path of real?.isNot.flatMap((entry) => entry.paths) ?? []) {
			expect(existsSync(join(repoRoot(), path))).toBe(true);
		}
	});
});

describe("outOfBet", () => {
	it("groups changed files by the exclusion they fall under", () => {
		expect(
			outOfBet(
				[
					"packages/astro-bookkit/src/styles/partials/toc.css",
					"scripts/mcp-server.ts",
					"scripts/verify.ts",
				],
				bet,
			),
		).toEqual([
			{
				what: "reader UI",
				files: ["packages/astro-bookkit/src/styles/partials/toc.css"],
			},
			{ what: "MCP work", files: ["scripts/mcp-server.ts"] },
		]);
	});
});

describe("new books", () => {
	const closed = { ...bet, knownBooks: ["running-hot"] };

	it("flags a file in a book the bet did not know", () => {
		expect(
			outOfBet(
				[
					"apps/running-hot/src/book.config.ts",
					"apps/match-to-july/src/book.config.ts",
				],
				closed,
			),
		).toEqual([
			{ what: "new books", files: ["apps/match-to-july/src/book.config.ts"] },
		]);
	});

	it("checks nothing when the bet lists no books", () => {
		expect(outOfBet(["apps/anything/src/book.config.ts"], bet)).toEqual([]);
	});

	it("reads the test's numbers, defaulting to B1's", () => {
		expect(bet.test).toEqual({ chapters: 3, maxNewMechanisms: 1 });
		expect(
			parseBet({ bet: { id: "B2", test: { chapters: 5 } } })?.test,
		).toEqual({ chapters: 5, maxNewMechanisms: 1 });
	});
});

describe("betNote", () => {
	const styles = ["packages/astro-bookkit/src/styles/bookkit.css"];

	it("says nothing about a change inside the bet", () => {
		expect(
			betNote(["scripts/verify.ts"], bet, new Date("2026-10-20")),
		).toBeUndefined();
		expect(betNote(styles, null, new Date("2026-10-20"))).toBeUndefined();
	});

	it("names the excluded work while the bet is running", () => {
		expect(betNote(styles, bet, new Date("2026-10-20"))).toBe(
			"Bet B9 excludes reader UI (1 file). Go on only if the author asked for it; say so in the PR. bun run bookkit bets",
		);
	});

	it("asks for a ruling once killBy has passed", () => {
		expect(daysPastKillBy(bet, new Date("2026-11-10T12:00:00Z"))).toBe(6);
		expect(betNote(styles, bet, new Date("2026-11-10T12:00:00Z"))).toBe(
			"Bet B9 passed its killBy (2026-11-04) 6 days ago and excludes reader UI (1 file). docs/bets.md needs a ruling before more of it.",
		);
	});
});
