import { describe, expect, it } from "bun:test";

import { defaultBookHomeCopy, resolveBookHomeCopy } from "./home-copy";

describe("home page copy", () => {
	it("uses the defaults when book.config.ts sets no home copy", () => {
		expect(resolveBookHomeCopy(undefined)).toEqual(defaultBookHomeCopy);
		expect(resolveBookHomeCopy({})).toEqual(defaultBookHomeCopy);
	});

	it("takes each field the config sets and keeps the default for the rest", () => {
		expect(
			resolveBookHomeCopy({
				kicker: "Runbook",
				mechanismsCard: { title: "Find the pattern" },
			}),
		).toEqual({
			kicker: "Runbook",
			mechanismsCard: {
				title: "Find the pattern",
				description: defaultBookHomeCopy.mechanismsCard.description,
			},
		});
	});
});
