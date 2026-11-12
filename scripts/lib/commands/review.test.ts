import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
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
 * `bookkit review`, in a workspace of its own, with a stand-in reviewer: a
 * script that answers with one finding when the chapter holds a word it is
 * given, and none otherwise. The prompt and the reply's reading are in
 * scripts/lib/chapter-review.test.ts.
 */

let workspace: string;

const CHAPTER = `---
slug: the-stall
status: draft
title: "The Stall"
mechanisms:
  - slow-walk
---

## Claim

A stall is a decision someone made. Nobody designed the backlog.
`;

const REVIEWER = `const prompt = await Bun.stdin.text();
const word = process.argv[2];
console.log(JSON.stringify({ findings: word && prompt.includes(word)
	? [{ rule: 0, where: "## Claim", what: "Says " + word + ".", fix: "Cut it." }]
	: [] }));
`;

waitForChildren();

const chapterPath = () =>
	join(workspace, "apps/tiny/src/content/book/chapters/01-the-stall.mdx");
const reviewer = (word = "") =>
	`'${process.execPath}' '${join(workspace, "reviewer.ts")}' ${word}`.trim();

const bookkit = (...args: string[]) =>
	runChild(
		[process.execPath, join(repoRoot(), "scripts", "bookkit.ts"), ...args],
		{ cwd: workspace, env: { ...process.env, BOOKKIT_JUDGE_COMMAND: "" } },
	);

beforeAll(() => {
	workspace = mkdtempSync(join(tmpdir(), "bookkit-review-"));
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
	writeFileSync(chapterPath(), CHAPTER);
	writeFileSync(join(workspace, "reviewer.ts"), REVIEWER);
});

afterAll(() => {
	rmSync(workspace, { recursive: true, force: true });
});

describe("bookkit review", () => {
	it("prints each reviewer's findings with its fix, keeps the replies, and leaves the chapter alone", () => {
		const reviewed = bookkit(
			"review",
			"tiny",
			"the-stall",
			"--judges",
			"2",
			"--judge",
			reviewer("designed"),
			"--judge",
			reviewer(),
		);
		expect(reviewed.status).toBe(0);
		expect(reviewed.output).toContain("read by 2 reviewer(s)");
		expect(reviewed.output).toContain(
			"· a mechanism's contract, ## Claim: Says designed.\n      fix: Cut it.",
		);
		expect(reviewed.output).toContain("nothing to change");
		const folder = join(workspace, ".bookkit/reviewing");
		const [review] = readdirSync(folder);
		expect(readdirSync(join(folder, review)).sort()).toEqual([
			"prompt.md",
			"reply-1.txt",
			"reply-2.txt",
			"review.json",
		]);
		expect(readFileSync(chapterPath(), "utf8")).toBe(CHAPTER);
	});

	it("takes the chapter by its path, and without a reviewer writes the prompt only", () => {
		const prompted = bookkit(
			"review",
			"apps/tiny/src/content/book/chapters/01-the-stall.mdx",
		);
		expect(prompted.status).toBe(0);
		expect(prompted.output).toContain("the reviewer's prompt is");
	});

	it("says so when a reviewer's reply is not a review", () => {
		const failed = bookkit("review", "tiny", "1", "--judge", "echo fine");
		expect(failed.status).toBe(1);
		expect(failed.output).toContain("the reply holds no JSON object");
	});
});
