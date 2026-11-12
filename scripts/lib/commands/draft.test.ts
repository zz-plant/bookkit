import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoRoot } from "../../_lib";
import { runChild, waitForChildren } from "../child-process.fixture";

/**
 * `bookkit draft`, in a workspace of its own, with stand-ins for the models:
 * a writer is `cat <file>` (a fixed reply), and a judge is a script that
 * ranks first the draft holding the word it is given. The brief, the
 * candidate's frontmatter, and the decision table are in
 * scripts/lib/draft-brief.test.ts and draft-ballots.test.ts.
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
- What a stall costs
`;

/** A draft's body: past the stub threshold, and holding `marker` for the judges. */
const body = (marker: string) => `## Claim

A stall is a decision someone made. ${marker} is the word this draft is known by.

## Who sets the pace

A slow walk is a pace someone chose. The request sits in a queue that a
named person could empty today. Ask who could have gone faster, and what
they were waiting for.

## What a stall costs

The person waiting pays in time, in missed shifts, and in the work of
asking again. The office pays nothing, so the pace holds until someone
with a lever is asked to account for it.
`;

const draftFile = (marker: string, frontmatter: string) =>
	`---\n${frontmatter}---\n\n${body(marker)}`;

const JUDGE = `const prompt = await Bun.stdin.text();
const [prefer, reject] = process.argv.slice(2);
const parts = prompt
	.slice(prompt.indexOf("# The drafts"))
	.split(/^## Draft (D\\d+)$/m);
const drafts = [];
for (let i = 1; i < parts.length; i += 2) {
	drafts.push({ id: parts[i], text: parts[i + 1] });
}
const best = drafts.find((draft) => draft.text.includes(prefer));
console.log(
	JSON.stringify({
		ranking: [best, ...drafts.filter((draft) => draft !== best)]
			.filter(Boolean)
			.map((draft) => draft.id),
		reject: drafts
			.filter((draft) => reject && draft.text.includes(reject))
			.map((draft) => ({ id: draft.id, why: reject + " states a fact the brief does not supply." })),
		why: prefer + " keeps to the claim.",
		fixes: [prefer + " should end on a check the reader can run."],
	}),
);
`;

waitForChildren();

const chapters = () => join(workspace, "apps/tiny/src/content/book/chapters");
const stubPath = () => join(chapters(), "01-the-stall.mdx");
const drafting = () => join(workspace, ".bookkit", "drafting");
/** The one request folder a test has made. */
const request = () => join(drafting(), readdirSync(drafting())[0]);
const writer = (name: string) => `cat '${join(workspace, name)}'`;
const judge = (prefer: string, reject = "") =>
	`'${process.execPath}' '${join(workspace, "judge.ts")}' ${prefer} ${reject}`.trim();
const flags = (flag: string, commands: string[]) =>
	commands.flatMap((command) => [flag, command]);

const bookkit = (...args: string[]) =>
	runChild(
		[process.execPath, join(repoRoot(), "scripts", "bookkit.ts"), ...args],
		{
			cwd: workspace,
			// The developer's own writer and judge commands stay out of the test.
			env: {
				...process.env,
				BOOKKIT_DRAFT_COMMAND: "",
				BOOKKIT_JUDGE_COMMAND: "",
			},
		},
	);

beforeAll(() => {
	workspace = mkdtempSync(join(tmpdir(), "bookkit-draft-"));
	const book = join(workspace, "apps/tiny/src");
	mkdirSync(join(book, "content/book/mechanisms"), { recursive: true });
	mkdirSync(chapters(), { recursive: true });
	writeFileSync(
		join(book, "book.config.ts"),
		'export const bookConfig = {\n\tslug: "tiny",\n\ttitle: "Tiny",\n\tstatus: "draft",\n\tcausalStance: "Delay is chosen.",\n};\n',
	);
	writeFileSync(
		join(book, "content/book/mechanisms/slow-walk.mdx"),
		'---\nslug: slow-walk\nstatus: draft\ntitle: "Slow walk"\ndefinition: "Processing a request at a crawl on purpose."\nis:\n  - "A pace someone chose."\nisNot:\n  - "A backlog nobody controls."\n---\n',
	);
	writeFileSync(
		join(chapters(), "00-overview.mdx"),
		'---\nslug: overview\nstatus: draft\ntitle: "Overview"\n---\n\nWhy waits have owners.\n',
	);
	writeFileSync(
		join(chapters(), "02-who-pays.mdx"),
		`---\nslug: who-pays\nstatus: draft\ntitle: "Who Pays"\n---\n\n${body("SAMPLE")}`,
	);
	writeFileSync(join(workspace, "judge.ts"), JUDGE);
	// What four writers reply: two drafts that keep to the brief, one that is
	// still a stub, and one that binds a mechanism the book does not define
	// and tries to retitle the chapter.
	const kept = 'slug: the-stall\nstatus: draft\ntitle: "The Stall"\n';
	writeFileSync(
		join(workspace, "alpha.mdx"),
		draftFile("ALPHA", `${kept}mechanisms:\n  - slow-walk\n`),
	);
	writeFileSync(
		join(workspace, "bravo.mdx"),
		// Wrapped as a chat model wraps a file.
		`Here is the chapter.\n\n\`\`\`mdx\n${draftFile("BRAVO", `${kept}mechanisms:\n  - slow-walk\nsummary: "A stall is chosen."\n`)}\`\`\`\n`,
	);
	writeFileSync(
		join(workspace, "charlie.mdx"),
		draftFile("CHARLIE", `${kept}mechanisms:\n  - slow-walk\n`),
	);
	writeFileSync(
		join(workspace, "short.mdx"),
		`---\n${kept}---\n\n## Claim\n\nA stall is a decision someone made.\n`,
	);
	writeFileSync(
		join(workspace, "hijack.mdx"),
		draftFile(
			"HIJACK",
			'slug: stalling\nstatus: published\ntitle: "Hijacked"\nmechanisms:\n  - made-up\n',
		),
	);
});

beforeEach(() => {
	writeFileSync(stubPath(), STUB);
	rmSync(drafting(), { recursive: true, force: true });
});

afterAll(() => {
	rmSync(workspace, { recursive: true, force: true });
});

describe("bookkit draft", () => {
	it("with no writer command, writes the brief and asks no one", () => {
		const drafted = bookkit("draft", "tiny", "the-stall");
		expect(drafted.status).toBe(0);
		expect(drafted.output).toContain(
			'18 words of prose, a stub until 60. Drafting to about 120, with "Who Pays" as the sample.',
		);
		expect(drafted.output).toContain("No writer command");
		expect(drafted.output).toContain("then: bun run bookkit draft resume");
		const brief = readFileSync(join(request(), "brief.md"), "utf8");
		expect(brief).toContain("A stall is a decision someone made.");
		expect(brief).toContain("### Slow walk (`slow-walk`)");
		expect(brief).toContain("What it argues: Delay is chosen.");
		// The sample is a drafted chapter, never the framing chapter.
		expect(brief).toContain("SAMPLE is the word this draft is known by.");
		expect(brief).not.toContain("Why waits have owners.");
		expect(readFileSync(stubPath(), "utf8")).toBe(STUB);
	});

	it("asks the writers, puts out the drafts that fail the check, and names the judges' winner without touching the chapter", () => {
		const drafted = bookkit(
			"draft",
			"tiny",
			"1",
			"--candidates",
			"4",
			...flags(
				"--writer",
				["alpha.mdx", "bravo.mdx", "short.mdx", "hijack.mdx"].map(writer),
			),
			"--judge",
			judge("ALPHA"),
		);
		expect(drafted.output).toContain(
			"Asking 4 writer(s), one at a time, with 4 commands in turn",
		);
		expect(drafted.output).toContain(
			"✓ candidate 1: 93 words, binds slow-walk",
		);
		expect(drafted.output).toContain("✓ candidate 2: 93 words");
		expect(drafted.output).toContain(
			"✗ candidate 3: out. 8 words of prose; a chapter is a stub until 60",
		);
		expect(drafted.output).toMatch(
			/✗ candidate 4: out\. .*unknown mechanism "made-up"/,
		);
		expect(drafted.output).toContain("Asking 3 judge(s), each on its own");
		expect(drafted.output).toMatch(
			/Winner: candidate 1 \(cat '.*alpha\.mdx'\), 93 words, binds slow-walk\. First choice of 3 of 3 judge\(s\)\./,
		);
		expect(drafted.output).toContain("judge 1: ALPHA keeps to the claim.");
		expect(drafted.status).toBe(0);
		expect(readFileSync(stubPath(), "utf8")).toBe(STUB);

		// The judges saw the two drafts that passed, under ids, and no writer.
		const prompt = readFileSync(
			join(request(), "judge-2", "prompt.md"),
			"utf8",
		);
		expect(prompt.match(/^## Draft D\d+$/gm)).toHaveLength(2);
		expect(prompt).not.toContain("HIJACK");
		expect(prompt).not.toContain("alpha.mdx");
		// A draft keeps the stub's title and status, whatever its writer sent.
		const hijack = readFileSync(join(request(), "candidate-4.mdx"), "utf8");
		expect(hijack).toContain("title: The Stall");
		expect(hijack).not.toContain("published");
		// The fence and the chat around a reply are gone; its summary is kept.
		const bravo = readFileSync(join(request(), "candidate-2.mdx"), "utf8");
		expect(bravo).toStartWith("---\nslug: the-stall\n");
		expect(bravo).toContain("summary: A stall is chosen.");
		expect(bravo).not.toContain("Here is the chapter");

		const applied = bookkit("draft", "apply");
		expect(applied.status).toBe(0);
		expect(applied.output).toContain(
			"Wrote candidate 1 into apps/tiny/src/content/book/chapters/01-the-stall.mdx (93 words).",
		);
		const chapter = readFileSync(stubPath(), "utf8");
		expect(chapter).toContain("ALPHA is the word this draft is known by.");
		expect(chapter).toStartWith("---\nslug: the-stall\nstatus: draft\n");
		expect(
			bookkit("check", "apps/tiny/src/content/book/chapters/01-the-stall.mdx")
				.output,
		).toContain("draft: 93 words of prose.");

		const results = bookkit("draft", "results");
		expect(results.output).toContain(
			"1 request(s) with a call, 1 written into a chapter.",
		);
		expect(results.output).toMatch(
			/alpha\.mdx'\n\s+1 draft\(s\): 1 passed the check, 0 rejected by the judges, 1 won, 1 written into a chapter/,
		);
		expect(results.output).toMatch(
			/short\.mdx'\n\s+1 draft\(s\): 0 passed the check, 0 rejected by the judges, 0 won, 0 written/,
		);
		expect(results.output).toMatch(
			/3 ballot\(s\): first choice was the winner in 3 of 3/,
		);
	});

	it("revise redrafts the winner from the judges' fixes, judged against it as it was, over the chapter it was applied to", () => {
		const drafted = bookkit(
			"draft",
			"tiny",
			"the-stall",
			"--candidates",
			"2",
			...flags("--writer", [writer("alpha.mdx"), writer("bravo.mdx")]),
			...flags("--judge", [judge("ALPHA")]),
			"--judges",
			"1",
			"--apply",
		);
		expect(drafted.status).toBe(0);
		expect(drafted.output).toContain("Winner: candidate 1");
		const first = request();
		const revised = bookkit(
			"draft",
			"revise",
			"--candidates",
			"1",
			...flags("--writer", [writer("charlie.mdx")]),
			...flags("--judge", [judge("CHARLIE")]),
		);
		expect(revised.status).toBe(0);
		expect(revised.output).toContain(
			"  - ALPHA should end on a check the reader can run.",
		);
		const folder = `${first}-revised`;
		const brief = readFileSync(join(folder, "brief.md"), "utf8");
		expect(brief).toContain("## Revise this draft");
		expect(brief).toContain("ALPHA is the word this draft is known by.");
		// Candidate 1 is the winner as it was, so a revision has to beat it.
		expect(readFileSync(join(folder, "candidate-1.mdx"), "utf8")).toBe(
			readFileSync(join(first, "candidate-1.mdx"), "utf8"),
		);
		expect(
			JSON.parse(readFileSync(join(folder, "request.json"), "utf8")),
		).toMatchObject({
			candidates: 2,
			judges: 1,
			revises: first.split("/").pop(),
		});
		expect(revised.output).toContain("Winner: candidate 2");
		const applied = bookkit("draft", "apply", folder);
		expect(applied.status).toBe(0);
		expect(readFileSync(stubPath(), "utf8")).toContain("CHARLIE");
		// The author's own edits are not the judges' draft to revise.
		writeFileSync(stubPath(), `${readFileSync(stubPath(), "utf8")}\nMine.\n`);
		const refused = bookkit("draft", "revise", folder, "--no-run");
		expect(refused.status).toBe(1);
		expect(refused.output).toContain(
			"has changed since candidate 2 was chosen",
		);
	});

	it("leaves a split to the author, who picks", () => {
		// The book left out: a flag given twice is not mistaken for the chapter.
		const drafted = bookkit(
			"draft",
			...flags("--writer", ["alpha.mdx", "bravo.mdx"].map(writer)),
			"the-stall",
			"--candidates",
			"2",
			"--judges",
			"2",
			...flags("--judge", [judge("ALPHA"), judge("BRAVO")]),
			"--apply",
		);
		expect(drafted.status).toBe(0);
		expect(drafted.output).toContain("The judges split");
		expect(drafted.output).toContain("--pick <candidate>");
		// --apply writes a winner, and a split has none.
		expect(readFileSync(stubPath(), "utf8")).toBe(STUB);
		const refused = bookkit("draft", "apply");
		expect(refused.status).toBe(1);
		expect(refused.output).toContain("The judges split on");
		const picked = bookkit("draft", "apply", "--pick", "2");
		expect(picked.status).toBe(0);
		expect(picked.output).toContain("Writing candidate 2, your pick.");
		expect(readFileSync(stubPath(), "utf8")).toContain("BRAVO is the word");
	});

	it("puts out a draft most judges reject, and applies the winner with --apply", () => {
		const drafted = bookkit(
			"draft",
			"tiny",
			"the-stall",
			"--candidates",
			"2",
			...flags("--writer", ["alpha.mdx", "bravo.mdx"].map(writer)),
			// Every judge ranks ALPHA first; two of the three also reject it.
			...flags("--judge", [
				judge("ALPHA", "ALPHA"),
				judge("ALPHA", "ALPHA"),
				judge("ALPHA"),
			]),
			"--apply",
		);
		expect(drafted.status).toBe(0);
		expect(drafted.output).toMatch(
			/rejected by 2 of 3 judges: candidate 1 \(.*\)\. ALPHA states a fact the brief does not supply\./,
		);
		expect(drafted.output).toContain("Winner: candidate 2");
		expect(drafted.output).toContain("Wrote candidate 2 into");
		expect(readFileSync(stubPath(), "utf8")).toContain("BRAVO is the word");
	});

	it("names no winner when the judges reject every draft", () => {
		const drafted = bookkit(
			"draft",
			"tiny",
			"the-stall",
			"--candidates",
			"1",
			"--writer",
			writer("alpha.mdx"),
			"--judge",
			judge("ALPHA", "ALPHA"),
			"--apply",
		);
		expect(drafted.status).toBe(1);
		expect(drafted.output).toContain(
			"No winner: most judges rejected every draft.",
		);
		expect(readFileSync(stubPath(), "utf8")).toBe(STUB);
	});

	it("resume takes drafts and ballots saved by hand, and asks only who has not answered", () => {
		expect(
			bookkit("draft", "tiny", "the-stall", "--candidates", "2").status,
		).toBe(0);
		// One draft saved by hand, as a model replied; the other writer fails.
		writeFileSync(
			join(request(), "candidate-1.mdx"),
			readFileSync(join(workspace, "hijack.mdx"), "utf8").replace(
				"made-up",
				"slow-walk",
			),
		);
		const first = bookkit("draft", "resume", "--writer", "exit 3");
		expect(first.output).toContain("Asking 1 writer(s)");
		expect(first.output).toMatch(
			/✗ writer 2 \(\d+s\): the command exited with 3/,
		);
		expect(first.output).toContain("✓ candidate 1: 93 words");
		expect(first.output).toContain("No judge command");
		expect(first.status).toBe(0);
		expect(readFileSync(join(request(), "candidate-1.mdx"), "utf8")).toContain(
			"title: The Stall",
		);

		// The second writer delivers: the judges' ids change, so a ballot on
		// the first set no longer applies.
		writeFileSync(
			join(request(), "ballot-1.json"),
			'{"ranking":["D1"],"reject":[],"why":"The only one."}',
		);
		const second = bookkit(
			"draft",
			"resume",
			"--writer",
			writer("bravo.mdx"),
			"--judge",
			judge("BRAVO"),
		);
		expect(second.output).toContain("Asking 1 writer(s)");
		expect(second.output).toContain("1 earlier ballot(s) no longer apply");
		expect(second.output).toContain("Asking 3 judge(s)");
		expect(second.output).toContain("Winner: candidate 2");

		// A third run has nothing left to ask.
		const third = bookkit("draft", "resume", "--judge", "exit 3");
		expect(third.output).not.toContain("Asking");
		expect(third.output).toContain("Winner: candidate 2");
	});

	it("does not write over a chapter that changed after the brief", () => {
		bookkit(
			"draft",
			"tiny",
			"the-stall",
			"--candidates",
			"1",
			"--judges",
			"1",
			"--writer",
			writer("alpha.mdx"),
			"--judge",
			judge("ALPHA"),
		);
		const edited = `${STUB}\nA line the author added.\n`;
		writeFileSync(stubPath(), edited);
		const applied = bookkit("draft", "apply");
		expect(applied.status).toBe(1);
		expect(applied.output).toContain(
			"apps/tiny/src/content/book/chapters/01-the-stall.mdx has changed since these drafts were written",
		);
		expect(readFileSync(stubPath(), "utf8")).toBe(edited);
	});

	it("--stubs drafts each stub but the framing chapter", () => {
		const drafted = bookkit("draft", "tiny", "--stubs", "--no-run");
		expect(drafted.status).toBe(0);
		expect(readdirSync(drafting())).toHaveLength(1);
		expect(drafted.output).toContain("01-the-stall.mdx: 18 words of prose");
		expect(drafted.output).not.toContain("00-overview.mdx");
		expect(drafted.output).toContain("1 stub(s) of tiny");
	});

	it("refuses a chapter that is not a stub, the framing chapter, and a chapter the book does not have", () => {
		const written = bookkit("draft", "tiny", "who-pays");
		expect(written.status).toBe(1);
		expect(written.output).toContain(
			"02-who-pays.mdx has 93 words of prose, so it is not a stub (under 60). To draft over what is there, add --redraft",
		);
		expect(bookkit("draft", "tiny", "who-pays", "--redraft").status).toBe(0);
		const framing = bookkit("draft", "tiny", "overview");
		expect(framing.status).toBe(1);
		expect(framing.output).toContain("Write it yourself.");
		const unknown = bookkit("draft", "tiny", "the-stal");
		expect(unknown.status).toBe(1);
		expect(unknown.output).toContain(
			'tiny has no chapter "the-stal". Did you mean the-stall?',
		);
		const none = bookkit("draft", "tiny");
		expect(none.status).toBe(1);
		expect(none.output).toContain(
			"tiny's next stub: bun run bookkit draft tiny the-stall",
		);
		expect(existsSync(drafting())).toBe(true);
	});
});
