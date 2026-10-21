import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checkBookContent, validateBookInMemory } from "./book-validator";

let root: string;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "bookkit-validate-"));
	mkdirSync(
		join(root, "apps", "test-book", "src", "content", "book", "mechanisms"),
		{
			recursive: true,
		},
	);
	for (const dir of ["toolkit", "chapters", "examples", "glossary"]) {
		mkdirSync(join(root, "apps", "test-book", "src", "content", "book", dir), {
			recursive: true,
		});
	}
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

const writeBook = (files: Array<[string, string]>): void => {
	for (const [file, content] of files) {
		writeFileSync(
			join(root, "apps", "test-book", "src", "content", "book", file),
			content,
			"utf8",
		);
	}
};

describe("validateBookInMemory frontmatter parsing", () => {
	it("parses YAML list fields as arrays (no false schema warnings)", () => {
		writeBook([
			[
				"mechanisms/starter-mechanism.mdx",
				`---
slug: starter-mechanism
status: draft
title: "Starter mechanism"
definition: "A repeatable pattern where a system produces harm while preserving surface legitimacy."
is:
  - "A named incentive keeps harm in motion without clear accountability."
isNot:
  - "One-off mistakes with no repeatable structure."
predictions:
  - "If the mechanism is active, similar outcomes will appear across unrelated cases."
tests:
  - "Ask: if the mechanism is active, would the outcome stay the same?"
---
Body.
`,
			],
			[
				"toolkit/starter-mechanism--starter-tool.mdx",
				`---
slug: starter-mechanism--starter-tool
status: draft
mechanism: starter-mechanism
name: "Starter tool"
trigger: "When you notice the same harm repeating even after good-faith effort."
timeboxMinutes: 10
steps:
  - "Name the repeating outcome in one sentence."
failureLooksLike:
  - "You cannot name a repeatable pattern after 10 minutes."
legitimateDemand:
  - "A clear, repeatable description of the harm."
---
Tool body.
`,
			],
		]);

		const result = validateBookInMemory({
			workspaceRoot: root,
			bookSlug: "test-book",
		});

		expect(result.warnings).toEqual([]);
		expect(result.ok).toBe(true);
	});

	it("reports what the shared checker reports, as normalized payloads", () => {
		writeBook([
			[
				"toolkit/orphan.mdx",
				'---\nslug: orphan\nmechanism: missing-mechanism\nname: "Orphan"\n---\n',
			],
		]);
		const result = validateBookInMemory({
			workspaceRoot: root,
			bookSlug: "test-book",
		});
		expect(result.ok).toBe(false);
		expect(result.errors[0]).toMatchObject({
			machineCode: "UNKNOWN_MECHANISM",
			severity: "error",
			gateLevel: "blocking",
		});
		expect(result.errors[0].nextAction).toContain(
			"mechanisms/missing-mechanism.mdx",
		);
		expect(result.warnings.map((w) => w.machineCode)).toContain(
			"FIELD_MISSING",
		);
	});
});

const writeConfig = (body: string): void => {
	writeFileSync(
		join(root, "apps", "test-book", "src", "book.config.ts"),
		`export const bookConfig = {\n\tslug: "test-book",\n${body}} as const;\nexport default bookConfig;\n`,
		"utf8",
	);
};

const check = () =>
	checkBookContent({ workspaceRoot: root, bookSlug: "test-book" });

const codes = (result: ReturnType<typeof check>) =>
	result.findings.map((finding) => `${finding.level}:${finding.code}`);

const chapter = (slug: string, status = "published", extra = "") =>
	`---\nslug: ${slug}\ntitle: "${slug}"\nstatus: ${status}\n${extra}---\nBody.\n`;

describe("the book's status sets the rules", () => {
	beforeEach(() => {
		writeBook([
			["chapters/01-start.mdx", chapter("start")],
			[
				"examples/draft-example.mdx",
				'---\nmechanism: m\ndomain: Housing\ntitle: "T"\nstatus: draft\n---\n',
			],
			[
				"mechanisms/m.mdx",
				'---\nslug: m\nstatus: published\ntitle: "M"\ndefinition: "d"\nis: ["a"]\nisNot: ["b"]\npredictions: ["c"]\ntests: ["e"]\n---\n',
			],
		]);
	});

	it("builds a draft book with its drafts", () => {
		writeConfig('\tstatus: "draft",\n');
		const result = check();
		expect(result).toMatchObject({
			ok: true,
			status: "draft",
			releaseMode: false,
		});
		expect(result.findings).toEqual([]);
	});

	it("refuses drafts in a published or stable book", () => {
		for (const status of ["published", "stable"]) {
			writeConfig(`\tstatus: "${status}",\n`);
			const result = check();
			expect(result.ok).toBe(false);
			expect(result.releaseMode).toBe(true);
			expect(codes(result)).toEqual(["error:DRAFT_IN_RELEASE"]);
		}
	});

	it("rejects a status that is not one of the four", () => {
		writeConfig('\tstatus: "publish",\n');
		const result = check();
		expect(result.ok).toBe(false);
		expect(result.findings[0]).toMatchObject({
			code: "BOOK_STATUS_INVALID",
			message:
				'Book status "publish" is not one of draft, in-review, published, stable',
		});
	});
});

describe("cross-file checks", () => {
	it("errors on two chapters with one slug, but not on a translation", () => {
		writeBook([
			["chapters/01-c.mdx", chapter("c")],
			["chapters/02-c.mdx", chapter("c")],
			["chapters/01-c.es.mdx", chapter("c", "published", "locale: es\n")],
		]);
		const result = check();
		expect(result.ok).toBe(false);
		const duplicates = result.findings.filter(
			(finding) => finding.code === "DUPLICATE_SLUG",
		);
		expect(duplicates).toHaveLength(1);
		expect(duplicates[0].file).toEndWith("chapters/02-c.mdx");
		expect(duplicates[0].message).toContain("chapters/01-c.mdx");
	});

	it("errors on records that share a slug through their file names", () => {
		mkdirSync(
			join(
				root,
				"apps",
				"test-book",
				"src",
				"content",
				"book",
				"examples",
				"a",
			),
			{ recursive: true },
		);
		mkdirSync(
			join(
				root,
				"apps",
				"test-book",
				"src",
				"content",
				"book",
				"examples",
				"b",
			),
			{ recursive: true },
		);
		const example = '---\nmechanism: m\ndomain: Housing\ntitle: "T"\n---\n';
		writeBook([
			["examples/a/repair.mdx", example],
			["examples/b/repair.mdx", example],
		]);
		expect(
			check().findings.filter((finding) => finding.code === "DUPLICATE_SLUG"),
		).toHaveLength(1);
	});

	it("errors on an unknown prerequisite in a published book", () => {
		writeConfig('\tstatus: "published",\n');
		writeBook([
			["chapters/00-overview.mdx", chapter("overview")],
			[
				"chapters/10-next.mdx",
				chapter(
					"next",
					"published",
					"prerequisites:\n  - overview\n  - no-such-chapter\n",
				),
			],
		]);
		expect(codes(check())).toContain("error:UNKNOWN_PREREQUISITE");
	});

	it("warns when a prerequisite comes after the chapter in reading order", () => {
		writeConfig('\tstatus: "draft",\n');
		writeBook([
			[
				"chapters/01-early.mdx",
				chapter("early", "draft", "prerequisites:\n  - late\n"),
			],
			["chapters/02-late.mdx", chapter("late", "draft")],
			// An explicit order puts this one first, ahead of what it needs.
			[
				"chapters/03-ordered.mdx",
				chapter("ordered", "draft", "order: 0\nprerequisites:\n  - early\n"),
			],
		]);
		const order = check().findings.filter(
			(finding) => finding.code === "PREREQUISITE_ORDER",
		);
		expect(order.map((finding) => finding.message)).toEqual([
			'Chapter "ordered" lists prerequisite "early", which readers reach only after it',
			'Chapter "early" lists prerequisite "late", which readers reach only after it',
		]);
		expect(order.every((finding) => finding.level === "warning")).toBe(true);
	});

	it("requires a chapter once the book is past draft", () => {
		writeConfig('\tstatus: "draft",\n');
		expect(check().ok).toBe(true);
		for (const status of ["in-review", "published"]) {
			writeConfig(`\tstatus: "${status}",\n`);
			expect(codes(check())).toEqual(["error:BOOK_EMPTY"]);
		}
		writeBook([["chapters/01-start.mdx", chapter("start")]]);
		expect(check().ok).toBe(true);
	});
});

describe("mechanismsIndex.urgency", () => {
	const mechanism = (slug: string) =>
		`---\nslug: ${slug}\nstatus: published\ntitle: "${slug}"\ndefinition: "d"\nis: ["a"]\nisNot: ["b"]\npredictions: ["c"]\ntests: ["e"]\n---\n`;
	const urgency = (status: string, entries: string) =>
		writeConfig(
			`\tstatus: "${status}",\n\tmechanismsIndex: {\n\t\turgency: {\n${entries}\t\t},\n\t},\n`,
		);
	const urgencyFindings = () =>
		check().findings.filter(
			(finding) => finding.field === "mechanismsIndex.urgency",
		);

	beforeEach(() => {
		writeBook([
			["chapters/01-start.mdx", chapter("start")],
			["mechanisms/delay-as-force.mdx", mechanism("delay-as-force")],
			["mechanisms/compliance-trap.mdx", mechanism("compliance-trap")],
		]);
	});

	it("accepts slugs that name the book's mechanisms", () => {
		urgency("published", '\t\t\t"delay-as-force": "urgent",\n');
		expect(check().findings).toEqual([]);
	});

	it("warns about a slug that names no mechanism in a draft, and says which one was meant", () => {
		urgency("draft", '\t\t\t"delay-as-forse": "urgent",\n');
		const findings = urgencyFindings();
		expect(findings).toHaveLength(1);
		expect(findings[0]).toMatchObject({
			level: "warning",
			code: "UNKNOWN_MECHANISM",
			message:
				'mechanismsIndex.urgency names "delay-as-forse", which is not a mechanism in this book, so the mechanisms index ignores it',
		});
		expect(findings[0].file).toEndWith("apps/test-book/src/book.config.ts");
		expect(findings[0].fix).toStartWith('Did you mean "delay-as-force"?');
		expect(check().ok).toBe(true);
	});

	it("refuses it in a published book", () => {
		urgency("published", '\t\t\t"compliance-trapp": "high-leverage",\n');
		const findings = urgencyFindings();
		expect(findings.map((finding) => finding.level)).toEqual(["error"]);
		expect(findings[0].fix).toContain('"compliance-trap"');
		expect(check().ok).toBe(false);
	});

	it("points a merged mechanism's slug at the one it was merged into", () => {
		writeFileSync(
			join(root, "corpus.json"),
			JSON.stringify({
				merged: [
					{
						into: "delay-as-force",
						date: "2026-10-01",
						before: [{ slug: "slow-walk" }, { slug: "delay-as-force" }],
					},
				],
			}),
		);
		urgency("published", '\t\t\t"slow-walk": "urgent",\n');
		expect(urgencyFindings()[0].fix).toBe(
			'slow-walk was merged into delay-as-force on 2026-10-01: rename the key to "delay-as-force", or remove it.',
		);
	});
});

describe("the frame check of the overview chapter", () => {
	const overview = (headings: string[]) =>
		chapter("overview", "draft").replace(
			"Body.\n",
			`${headings.join("\n\nText.\n\n")}\n`,
		);
	const frameFinding = (frameSlug: string) =>
		checkBookContent({
			workspaceRoot: root,
			bookSlug: "test-book",
			frameSlug,
		}).findings.find((finding) => finding.code === "FRAME_STEP_MISSING");

	it("reads the whole heading, so a step named in two words counts", () => {
		writeBook([
			[
				"chapters/00-overview.mdx",
				overview(["## Steps", "## Failure Modes", "## Checklist"]),
			],
		]);
		expect(frameFinding("field-guide")).toBeUndefined();
	});

	it("names each missing step, and the heading that would add it", () => {
		writeBook([
			[
				"chapters/00-overview.mdx",
				overview(["## Steps to take", "## Failure modes we have seen"]),
			],
		]);
		expect(frameFinding("field-guide")).toMatchObject({
			level: "warning",
			message:
				'Framing chapter (00-overview.mdx) for frame "field-guide" is missing required step(s): steps, failure-modes, checklist',
			fix: 'Add a heading for each missing step to chapters/00-overview.mdx, its whole text the step\'s name (e.g. "## Steps"); the field-guide frame requires them in that chapter.',
		});
	});

	it("does not read the frontmatter or fenced code as headings", () => {
		writeBook([
			[
				"chapters/00-overview.mdx",
				`---\nslug: overview\ntitle: "Overview"\nstatus: draft\n# recognition\n---\n\n\`\`\`md\n## Exoneration\n\`\`\`\n\n## Mechanism\n\n## Agency\n`,
			],
		]);
		expect(frameFinding("intervention")?.message).toEndWith(
			"missing required step(s): recognition, exoneration",
		);
	});
});
