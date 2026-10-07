import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { repoRoot } from "../_lib";
import {
	chapterSource,
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
			'---\nslug: repair-has-a-clock\ntitle: "Repair has a clock"\nstatus: draft\n',
		);
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
