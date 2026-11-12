import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoRoot } from "../../_lib";
import { runChild, waitForChildren } from "../child-process.fixture";
import { bestVersion, revisionNotesFrom } from "./finish";

/**
 * `bookkit finish`, in a workspace of its own, with stand-ins for the models:
 * a writer is `cat <file>`, and one script is both reviewer and judge. As a
 * reviewer it finds one thing to change in a chapter that holds HEDGE; as a
 * judge it ranks first the draft holding the word it is given.
 */

let workspace: string;

const STUB = `---
slug: the-stall
status: draft
title: "The Stall"
mechanisms:
  - slow-walk
---

## Claim

A stall is a decision someone made.

## Planned sections

- Who sets the pace
`;

const body = (marker: string) => `## Claim

A stall is a decision someone made. ${marker} marks this draft.

## Who sets the pace

A slow walk is a pace someone chose. The request sits in a queue that a
named person could empty today. Ask who could have gone faster, and what
they were waiting for, and write down the answer you get. Then ask
again in a week, and compare the two answers side by side.
`;

const kept =
	'slug: the-stall\nstatus: draft\ntitle: "The Stall"\nmechanisms:\n  - slow-walk\n';

const MODEL = `const prompt = await Bun.stdin.text();
const prefer = process.argv[2];
if (prompt.includes("You are a blind reviewer")) {
	const chapter = prompt.slice(prompt.indexOf("<chapter>"));
	const findings = chapter.includes("HEDGE")
		? [{ rule: 4, where: "## Claim", what: "It hedges.", fix: "Say it plainly." }]
		: [];
	// WORSE is two findings: a revision the judges liked and the reviewer did not.
	if (chapter.includes("WORSE")) findings.push(
		{ rule: 2, where: "## Claim", what: "It coins a term." },
		{ rule: 3, where: "## Claim", what: "It cites a study." },
	);
	console.log(JSON.stringify({ findings }));
} else {
	// FLAKY: the first judge call prints prose instead of a ballot.
	const flag = process.env.FLAKY_FLAG;
	if (flag && !(await Bun.file(flag).exists())) {
		await Bun.write(flag, "1");
		console.log("I would rather not say.");
		process.exit(0);
	}
	const parts = prompt.slice(prompt.indexOf("# The drafts")).split(/^## Draft (D\\d+)$/m);
	const drafts = [];
	for (let i = 1; i < parts.length; i += 2) drafts.push({ id: parts[i], text: parts[i + 1] });
	const best = drafts.find((draft) => draft.text.includes(prefer)) ?? drafts[0];
	console.log(JSON.stringify({
		ranking: [best, ...drafts.filter((draft) => draft !== best)].map((draft) => draft.id),
		reject: [],
		why: "",
		fixes: [],
	}));
}
`;

waitForChildren();

const chapterPath = () =>
	join(workspace, "apps/tiny/src/content/book/chapters/01-the-stall.mdx");
const writer = (name: string) => `cat '${join(workspace, name)}'`;
const model = (prefer: string) =>
	`'${process.execPath}' '${join(workspace, "model.ts")}' ${prefer}`;

const bookkit = (...args: string[]) => bookkitWith({}, ...args);

const bookkitWith = (env: Record<string, string>, ...args: string[]) =>
	runChild(
		[process.execPath, join(repoRoot(), "scripts", "bookkit.ts"), ...args],
		{
			cwd: workspace,
			env: {
				...process.env,
				BOOKKIT_DRAFT_COMMAND: "",
				BOOKKIT_JUDGE_COMMAND: "",
				...env,
			},
		},
	);

/** Drafts the stub with the HEDGE draft and applies it, as draft apply does. */
const draftHedged = () => {
	const drafted = bookkit(
		"draft",
		"tiny",
		"the-stall",
		"--candidates",
		"1",
		"--judges",
		"1",
		"--writer",
		writer("hedge.mdx"),
		"--judge",
		model("HEDGE"),
		"--apply",
	);
	expect(drafted.status).toBe(0);
	expect(readFileSync(chapterPath(), "utf8")).toContain("HEDGE");
};

beforeAll(() => {
	workspace = mkdtempSync(join(tmpdir(), "bookkit-finish-"));
	const book = join(workspace, "apps/tiny/src");
	mkdirSync(join(book, "content/book/mechanisms"), { recursive: true });
	mkdirSync(join(book, "content/book/chapters"), { recursive: true });
	writeFileSync(
		join(book, "book.config.ts"),
		'export const bookConfig = {\n\tslug: "tiny",\n\ttitle: "Tiny",\n\tstatus: "draft",\n};\n',
	);
	writeFileSync(
		join(book, "content/book/mechanisms/slow-walk.mdx"),
		'---\nslug: slow-walk\nstatus: draft\ntitle: "Slow walk"\ndefinition: "Processing a request at a crawl on purpose."\nis:\n  - "A pace someone chose."\nisNot:\n  - "A backlog nobody controls."\n---\n',
	);
	writeFileSync(
		join(book, "content/book/chapters/02-who-pays.mdx"),
		`---\nslug: who-pays\nstatus: draft\ntitle: "Who Pays"\n---\n\n${body("SAMPLE")}`,
	);
	writeFileSync(join(workspace, "model.ts"), MODEL);
	writeFileSync(
		join(workspace, "hedge.mdx"),
		`---\n${kept}---\n\n${body("HEDGE")}`,
	);
	writeFileSync(
		join(workspace, "plain.mdx"),
		`---\n${kept}---\n\n${body("PLAIN")}`,
	);
	writeFileSync(
		join(workspace, "worse.mdx"),
		`---\n${kept}---\n\n${body("WORSE")}`,
	);
});

beforeEach(() => {
	writeFileSync(chapterPath(), STUB);
	rmSync(join(workspace, ".bookkit"), { recursive: true, force: true });
});

afterAll(() => {
	rmSync(workspace, { recursive: true, force: true });
});

describe("bookkit finish", () => {
	it("revises a drafted chapter from its review until the reviewer has nothing left to say", () => {
		draftHedged();
		const finished = bookkit(
			"finish",
			"tiny",
			"--candidates",
			"1",
			"--judges",
			"1",
			"--writer",
			writer("plain.mdx"),
			"--judge",
			model("PLAIN"),
		);
		expect(finished.status).toBe(0);
		expect(finished.output).toContain("· voice, ## Claim: It hedges.");
		expect(finished.output).toContain(
			"apps/tiny/src/content/book/chapters/01-the-stall.mdx: 1 → 0 findings, nothing left to change",
		);
		const chapter = readFileSync(chapterPath(), "utf8");
		expect(chapter).toContain("PLAIN marks this draft.");
		expect(chapter).not.toContain("HEDGE");
	});

	it("keeps the chapter when no revision beats it", () => {
		draftHedged();
		const finished = bookkit(
			"finish",
			"tiny",
			"the-stall",
			"--candidates",
			"1",
			"--judges",
			"1",
			"--writer",
			writer("plain.mdx"),
			"--judge",
			model("HEDGE"),
		);
		expect(finished.status).toBe(0);
		expect(finished.output).toContain("1 findings, no revision beat it");
		expect(readFileSync(chapterPath(), "utf8")).toContain("HEDGE");
	});

	it("puts back the version with the fewest findings when a round makes it worse", () => {
		draftHedged();
		const finished = bookkit(
			"finish",
			"tiny",
			"the-stall",
			"--candidates",
			"1",
			"--judges",
			"1",
			"--writer",
			writer("worse.mdx"),
			"--judge",
			model("WORSE"),
		);
		expect(finished.status).toBe(0);
		expect(finished.output).toContain(
			"1 → 2 findings, no longer falling; kept round 1's version (1)",
		);
		expect(readFileSync(chapterPath(), "utf8")).toContain("HEDGE");
	});

	it("asks a judge again when its first reply is not a ballot", () => {
		draftHedged();
		const finished = bookkitWith(
			{ FLAKY_FLAG: join(workspace, "flaky-once") },
			"finish",
			"tiny",
			"the-stall",
			"--candidates",
			"1",
			"--judges",
			"1",
			"--writer",
			writer("plain.mdx"),
			"--judge",
			model("PLAIN"),
		);
		expect(finished.output).toContain("asking again who did not answer");
		expect(finished.output).toContain("1 → 0 findings, nothing left to change");
		rmSync(join(workspace, "flaky-once"), { force: true });
	});

	it("does not rewrite a chapter its author has edited, unless told to", () => {
		draftHedged();
		writeFileSync(
			chapterPath(),
			`${readFileSync(chapterPath(), "utf8")}\nMine.\n`,
		);
		const args = [
			"finish",
			"tiny",
			"the-stall",
			"--writer",
			writer("plain.mdx"),
			"--judge",
			model("PLAIN"),
		];
		const refused = bookkit(...args);
		expect(refused.status).toBe(1);
		expect(refused.output).toContain(
			"finish does not rewrite an author's words",
		);
		const all = bookkit(
			"finish",
			"tiny",
			"--writer",
			"true",
			"--judge",
			"true",
		);
		expect(all.output).toContain("has no chapter that still holds a draft");
	});

	it("needs a writer and a judge", () => {
		const refused = bookkit("finish", "tiny");
		expect(refused.status).toBe(1);
		expect(refused.output).toContain("needs a writer command");
	});
});

describe("bestVersion", () => {
	it("takes the fewest findings, the latest of a tie", () => {
		expect(
			bestVersion([
				{ round: 1, count: 9 },
				{ round: 2, count: 6 },
				{ round: 3, count: 8 },
				{ round: 4, count: 6 },
			]),
		).toEqual({ round: 4, count: 6 });
	});
});

describe("revisionNotesFrom", () => {
	it("gives each finding with its fix, then the check's warnings, once each", () => {
		const finding = {
			rule: 2,
			where: "## A",
			what: "Coins a term.",
			fix: "Cut it.",
		};
		expect(
			revisionNotesFrom(
				[
					{ reviewer: 1, command: "x", seconds: 1, findings: [finding] },
					{ reviewer: 2, command: "x", seconds: 1, findings: [finding] },
				],
				[{ message: "No summary.", fix: "Add one." }],
			),
		).toEqual([
			"## A: Coins a term. Fix: Cut it.",
			"The check warns: No summary. Fix: Add one.",
		]);
	});
});
