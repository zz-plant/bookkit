import { afterAll, beforeAll, describe, expect, it } from "bun:test";
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

/**
 * `bookkit define`, in a workspace of its own, with a stand-in writer: `cat`
 * of a fixed JSON reply. The prompt and the fields are in
 * scripts/lib/mechanism-define.test.ts.
 */

let workspace: string;

const DRAFT = `---
slug: context-debt
title: "Context debt"
definition: ""
is: []
isNot: []
predictions: []
tests: []
status: draft
---
`;

waitForChildren();

const mechanisms = () =>
	join(workspace, "apps/tiny/src/content/book/mechanisms");
const draftPath = () => join(mechanisms(), "context-debt.mdx");
const writer = (name: string) => `cat '${join(workspace, name)}'`;

const bookkit = (...args: string[]) =>
	runChild(
		[process.execPath, join(repoRoot(), "scripts", "bookkit.ts"), ...args],
		{ cwd: workspace, env: { ...process.env, BOOKKIT_DRAFT_COMMAND: "" } },
	);

beforeAll(() => {
	workspace = mkdtempSync(join(tmpdir(), "bookkit-define-"));
	const book = join(workspace, "apps/tiny/src");
	mkdirSync(mechanisms(), { recursive: true });
	mkdirSync(join(book, "content/book/chapters"), { recursive: true });
	writeFileSync(
		join(book, "book.config.ts"),
		'export const bookConfig = {\n\tslug: "tiny",\n\ttitle: "Tiny",\n\tstatus: "draft",\n};\n',
	);
	writeFileSync(
		join(mechanisms(), "slow-walk.mdx"),
		'---\nslug: slow-walk\nstatus: draft\ntitle: "Slow walk"\ndefinition: "Processing a request at a crawl on purpose, so the person waiting gives up."\nis:\n  - "A pace someone chose."\nisNot:\n  - "A backlog nobody controls."\n---\n',
	);
	writeFileSync(
		join(book, "content/book/chapters/01-handoffs.mdx"),
		'---\nslug: handoffs\nstatus: draft\ntitle: "Handoffs"\n---\n\nContext debt compounds at every shift change.\n',
	);
	writeFileSync(
		join(workspace, "good.json"),
		JSON.stringify({
			definition:
				"Shift changes that drop what the next shift needs to finish the work.",
			is: ["A ticket handed over with no notes."],
			isNot: ["A handoff the next shift never needed."],
			predictions: [],
			tests: ["Ask the next shift what it had to rediscover."],
		}),
	);
	writeFileSync(
		join(workspace, "copy.json"),
		JSON.stringify({
			definition:
				"Processing a request at a crawl on purpose, so the person waiting gives up.",
			is: ["A pace someone chose."],
			isNot: ["A backlog nobody controls."],
		}),
	);
});

afterAll(() => {
	rmSync(workspace, { recursive: true, force: true });
});

describe("bookkit define", () => {
	it("shows a proposal from the book's sentences, then --apply writes that proposal into the empty fields", () => {
		writeFileSync(draftPath(), DRAFT);
		const shown = bookkit(
			"define",
			"tiny",
			"context-debt",
			"--writer",
			writer("good.json"),
		);
		expect(shown.status).toBe(0);
		expect(shown.output).toContain(
			'1 sentence(s) of the book use "Context debt"',
		);
		expect(shown.output).toContain("definition: Shift changes that drop");
		expect(shown.output).toContain(
			"It passes the check and overlaps no mechanism.",
		);
		expect(readFileSync(draftPath(), "utf8")).toBe(DRAFT);
		// --apply writes what was shown; it does not ask the writer again.
		const applied = bookkit(
			"define",
			"tiny",
			"context-debt",
			"--apply",
			"--writer",
			"exit 3",
		);
		expect(applied.status).toBe(0);
		expect(applied.output).toContain("Wrote definition, is, isNot, tests");
		expect(readFileSync(draftPath(), "utf8")).toContain(
			"Ask the next shift what it had to rediscover.",
		);
		const again = bookkit("define", "tiny", "context-debt");
		expect(again.status).toBe(1);
		expect(again.output).toContain("already has a definition");
	});

	it("does not write a definition that reads like another mechanism", () => {
		writeFileSync(draftPath(), DRAFT);
		rmSync(join(workspace, ".bookkit"), { recursive: true, force: true });
		const refused = bookkit(
			"define",
			"tiny",
			"context-debt",
			"--apply",
			"--writer",
			writer("copy.json"),
		);
		expect(refused.status).toBe(1);
		expect(refused.output).toContain(
			"Not written: it reads like Slow walk (`slow-walk`)",
		);
		expect(readFileSync(draftPath(), "utf8")).toBe(DRAFT);
	});
});
