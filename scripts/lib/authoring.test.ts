import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoRoot } from "../_lib";
import {
	chapterDraft,
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

describe("chapterDraft", () => {
	const words = (n: number) =>
		Array.from({ length: n }, () => "word").join(" ");
	const chapter = (body: string) =>
		`---\nslug: a\ntitle: "A"\nmechanisms:\n  - one\n---\n\n${body}\n`;

	it("calls a chapter under site.minIndexableWords a stub, at the same count the build uses", () => {
		const draft = chapterDraft(chapter(words(59)), ["one"], ["one", "two"]);
		expect(draft).toMatchObject({ minimum: 60, stub: true, binds: ["one"] });
		expect(chapterDraft(chapter(words(60)), ["one"], ["one"]).stub).toBe(false);
	});

	it("follows the book's own threshold, and 0 turns stubs off", () => {
		expect(
			chapterDraft(chapter(words(30)), [], [], { minIndexableWords: 20 }).stub,
		).toBe(false);
		expect(
			chapterDraft(chapter(words(5)), [], [], { minIndexableWords: 0 }).stub,
		).toBe(false);
	});

	it("lists the book's mechanisms the chapter does not bind, sorted", () => {
		expect(
			chapterDraft(chapter(words(70)), ["one"], ["three", "one", "two"])
				.unbound,
		).toEqual(["three", "two"]);
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

/** A mechanism file, for a fixture book. */
const mechanism = (slug: string, title: string, definition: string) => `---
slug: ${slug}
title: "${title}"
definition: "${definition}"
is:
  - "${definition}"
---
`;

describe("findSimilarMechanisms", () => {
	// A workspace of fixture books, so the ranking does not depend on which
	// books this repository happens to hold.
	const cwd = process.cwd();
	let workspace: string;
	const writeMechanisms = (book: string, files: Record<string, string>) => {
		const dir = join(workspace, "apps", book, "src", "content", "book");
		mkdirSync(join(dir, "mechanisms"), { recursive: true });
		for (const [slug, source] of Object.entries(files)) {
			writeFileSync(join(dir, "mechanisms", `${slug}.mdx`), source);
		}
	};

	beforeAll(() => {
		workspace = mkdtempSync(join(tmpdir(), "bookkit-similar-"));
		const delay = mechanism(
			"delay-as-force",
			"Delay as force",
			"Waiting is used to exhaust options and coerce agreement.",
		);
		writeMechanisms("first-book", {
			"delay-as-force": delay,
			"compliance-trap": mechanism(
				"compliance-trap",
				"Compliance trap",
				"Warmth is leveraged to secure compliance and block refusal.",
			),
		});
		writeMechanisms("second-book", {
			"delay-as-force": delay,
			"buffer-loss": mechanism(
				"buffer-loss",
				"Buffer loss",
				"Less buffer means less room to recover from a mistake.",
			),
		});
		process.chdir(workspace);
	});

	afterAll(() => {
		process.chdir(cwd);
		rmSync(workspace, { recursive: true, force: true });
	});

	it("ranks a mechanism above others when its own words are proposed", () => {
		const [first] = findSimilarMechanisms({ title: "Delay as force" });
		expect(first?.slug).toBe("delay-as-force");
		expect([...(first?.books ?? [])].sort()).toEqual([
			"first-book",
			"second-book",
		]);
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
