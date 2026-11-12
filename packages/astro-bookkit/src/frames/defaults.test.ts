import { describe, expect, it } from "bun:test";
import { frameFrontDoor } from "./defaults";

describe("frameFrontDoor", () => {
	it("opens a runbook on its actions", () => {
		expect(frameFrontDoor("runbook")).toBe("actions");
	});

	it("opens every other frame, and a book with none, on reading", () => {
		for (const slug of ["intervention", "explainer", "field-guide"]) {
			expect(frameFrontDoor(slug)).toBe("reading");
		}
		expect(frameFrontDoor(undefined)).toBe("reading");
		expect(frameFrontDoor("no-such-frame")).toBe("reading");
	});
});
