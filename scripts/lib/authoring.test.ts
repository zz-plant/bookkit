import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { repoRoot } from "../_lib";
import {
	chapterSource,
	findSimilarMechanisms,
	groupFindingsByFile,
	nextChapterFileName,
} from "./authoring";

describe("nextChapterFileName", () => {
	it("continues a book numbered in tens", () => {
		expect(
			nextChapterFileName(
				["00-overview.mdx", "10-triage.mdx", "40-drills.mdx"],
				"Pager handoff",
			),
		).toEqual({ fileName: "50-pager-handoff.mdx", slug: "pager-handoff" });
	});

	it("continues a book numbered by one, keeping the padding", () => {
		expect(
			nextChapterFileName(
				["00-overview.mdx", "08-housing.mdx", "09-platforms.mdx"],
				"Repair has a clock",
			).fileName,
		).toBe("10-repair-has-a-clock.mdx");
	});

	it("starts at 01 in an empty book", () => {
		expect(nextChapterFileName([], "Opening").fileName).toBe("01-opening.mdx");
	});
});

describe("chapterSource", () => {
	it("writes draft frontmatter and lists the mechanisms to bind", () => {
		const source = chapterSource({
			slug: "repair-has-a-clock",
			title: "Repair has a clock",
			mechanismSlugs: ["delay-as-force"],
		});
		expect(source).toStartWith(
			'---\nslug: repair-has-a-clock\ntitle: "Repair has a clock"\n',
		);
		expect(source).toContain("\nstatus: draft\n");
		expect(source).toContain("This book's mechanisms: delay-as-force.");
	});
});

describe("groupFindingsByFile", () => {
	it("folds one file's missing fields into one line", () => {
		const file = join(repoRoot(), "apps/demo/src/content/book/toolkit/a.mdx");
		expect(
			groupFindingsByFile([
				"Framing chapter is missing required step(s): agency",
				`Tool missing trigger: ${file}`,
				`Tool missing steps list: ${file}`,
			]),
		).toEqual([
			"Framing chapter is missing required step(s): agency",
			"apps/demo/src/content/book/toolkit/a.mdx: Tool missing trigger, steps list",
		]);
	});

	it("keeps unrelated problems for one file separate", () => {
		const file = join(
			repoRoot(),
			"apps/demo/src/content/book/mechanisms/b.mdx",
		);
		expect(
			groupFindingsByFile([
				`Mechanism missing definition: ${file}`,
				`Duplicate slug: ${file}`,
			]),
		).toEqual([
			"apps/demo/src/content/book/mechanisms/b.mdx: Mechanism missing definition; Duplicate slug",
		]);
	});
});

describe("findSimilarMechanisms", () => {
	it("ranks a mechanism above others when its own words are proposed", () => {
		const [first] = findSimilarMechanisms({ title: "Delay as force" });
		expect(first?.slug).toBe("delay-as-force");
		expect(first?.books).toEqual(["bad-people", "running-hot"]);
	});

	it("does not stem 'less' to 'les'", () => {
		const matches = findSimilarMechanisms(
			{ title: "Less buffer", definition: "less buffer" },
			undefined,
			20,
		);
		expect(matches.flatMap((match) => match.sharedWords)).not.toContain("les");
	});
});
