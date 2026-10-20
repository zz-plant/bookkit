import { describe, expect, it } from "bun:test";

import {
	defaultMechanismsIndexCopy,
	resolveMechanismsIndexCopy,
} from "./mechanisms-index-copy";

describe("mechanisms index copy", () => {
	it("uses the defaults when book.config.ts sets no mechanismsIndex", () => {
		expect(resolveMechanismsIndexCopy(undefined)).toEqual(
			defaultMechanismsIndexCopy,
		);
		expect(resolveMechanismsIndexCopy({})).toEqual(defaultMechanismsIndexCopy);
	});

	it("takes each field the config sets and keeps the default for the rest", () => {
		expect(
			resolveMechanismsIndexCopy({ urgency: { "delay-as-force": "urgent" } }),
		).toEqual({
			lede: defaultMechanismsIndexCopy.lede,
			urgency: { "delay-as-force": "urgent" },
		});
		expect(resolveMechanismsIndexCopy({ lede: "Incident patterns." })).toEqual({
			lede: "Incident patterns.",
			urgency: {},
		});
	});
});
