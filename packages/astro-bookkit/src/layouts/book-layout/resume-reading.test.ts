import { describe, expect, it } from "bun:test";

import { chapterToResume, resumeChapters } from "./resume-reading";

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

	it("offers only chapters that link to a page of this site", () => {
		const listed = (href: string) =>
			resumeChapters(
				JSON.stringify([{ slug: "drills", label: "Drills", href }]),
			);
		expect(listed("/read/chapters/drills")).toEqual([
			{ slug: "drills", label: "Drills", href: "/read/chapters/drills" },
		]);
		for (const href of [
			"//evil.example/read/chapters/drills",
			"/\\evil.example/read",
			"/\t/evil.example/read",
			"javascript:alert(1)",
			"https://evil.example/read",
			"read/chapters/drills",
		]) {
			expect(listed(href), href).toEqual([]);
		}
		expect(resumeChapters("not json")).toEqual([]);
		expect(resumeChapters(undefined)).toEqual([]);
		expect(resumeChapters('[{"slug":"drills"}]')).toEqual([]);
	});
});
