import { describe, expect, it } from "bun:test";

import { chapterToResume } from "./resume-reading";

const chapters = [
	{
		slug: "overview",
		label: "Own the incident",
		href: "/read/chapters/overview",
	},
	{ slug: "drills", label: "Drills", href: "/read/chapters/drills" },
];

describe("resume reading", () => {
	it("offers the saved chapter, by its current title", () => {
		expect(chapterToResume({ slug: "drills" }, chapters)).toEqual(chapters[1]);
	});

	it("offers nothing on a first visit, for a removed chapter, or for anything else saved", () => {
		for (const stored of [null, undefined, "drills", { slug: 3 }, {}]) {
			expect(chapterToResume(stored, chapters)).toBeNull();
		}
		expect(chapterToResume({ slug: "renamed" }, chapters)).toBeNull();
	});
});
