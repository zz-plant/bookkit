import { describe, expect, it } from "bun:test";
import { conflictMarkersIn } from "./conflict-markers";

// Built, not written out, so this file never holds a marker line itself.
const ours = `${"<".repeat(7)} HEAD`;
const base = `${"|".repeat(7)} ed7b63d`;
const theirs = `${">".repeat(7)} 3c2909d`;

describe("conflictMarkersIn", () => {
	it("finds each kind of marker, diff3's base marker included", () => {
		const source = [
			"# Changelog",
			ours,
			"mine",
			base,
			"=======",
			"theirs",
			theirs,
		].join("\n");
		expect(conflictMarkersIn("CHANGELOG.md", source)).toEqual([
			{ file: "CHANGELOG.md", line: 2, text: ours },
			{ file: "CHANGELOG.md", line: 4, text: base },
			{ file: "CHANGELOG.md", line: 7, text: theirs },
		]);
	});

	it("leaves a Markdown heading underline and a table row alone", () => {
		expect(
			conflictMarkersIn(
				"a.md",
				"Title\n=======\n\n| a | b |\n||||||||\n<<<<<<<<\n",
			),
		).toEqual([]);
	});
});
