import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoRoot } from "./_lib";
import { writeHealthyDist } from "./lib/build-output.fixture";

/**
 * `bookkit deploy` in a scratch workspace whose books both have a dist/ that
 * passes check:build. Its wrangler is a stand-in that records the book it was
 * asked to publish, so nothing is deployed.
 */

const MECHANISM = `---
slug: incident-triage
status: draft
title: "Incident triage"
definition: "Sorting incoming alerts by severity before anyone starts fixing."
is:
  - "Naming a severity and an owner before diagnosis."
isNot:
  - "Diagnosing the root cause."
predictions:
  - "Teams that triage first page fewer people per incident."
tests:
  - "Count people paged per incident before and after."
---
Body.
`;

const tool = (slug: string, mechanism: string, timeboxMinutes: number) => `---
slug: ${slug}
status: draft
mechanism: ${mechanism}
name: "${slug}"
trigger: "A pager alert fires and no one has stated what it means."
timeboxMinutes: ${timeboxMinutes}
steps:
  - "State the affected surface in one sentence."
failureLooksLike:
  - "A long thread with no severity."
legitimateDemand:
  - "A severity and a named owner."
---
Body.
`;

const BROKEN_TOOL = "toolkit/root-cause-analysis--write-postmortem.mdx";

let workspace: string;

const writeBook = (book: string, files: Record<string, string>) => {
	const content = join(workspace, "apps", book, "src", "content", "book");
	for (const dir of [
		"chapters",
		"mechanisms",
		"toolkit",
		"examples",
		"glossary",
	]) {
		mkdirSync(join(content, dir), { recursive: true });
	}
	for (const [file, source] of Object.entries(files)) {
		writeFileSync(join(content, file), source);
	}
	writeHealthyDist(join(workspace, "apps", book, "dist"));
};

/** Runs `bookkit deploy` there; `published` lists the books wrangler received. */
const deploy = (...args: string[]) => {
	const log = join(workspace, "published.log");
	rmSync(log, { force: true });
	const result = Bun.spawnSync(
		[
			process.execPath,
			"run",
			join(repoRoot(), "scripts", "bookkit.ts"),
			"deploy",
			...args,
			"--no-build",
			"--dry-run",
		],
		{ cwd: workspace, stdout: "pipe", stderr: "pipe" },
	);
	return {
		status: result.exitCode,
		output: `${result.stdout.toString()}${result.stderr.toString()}`,
		published: existsSync(log)
			? readFileSync(log, "utf8").trim().split("\n")
			: [],
	};
};

beforeAll(() => {
	workspace = mkdtempSync(join(tmpdir(), "bookkit-deploy-"));
	// deploy runs scripts/check-build.ts and node_modules/.bin/wrangler from
	// the directory it is started in.
	symlinkSync(join(repoRoot(), "scripts"), join(workspace, "scripts"));
	const bin = join(workspace, "node_modules", ".bin");
	mkdirSync(bin, { recursive: true });
	writeFileSync(
		join(bin, "wrangler"),
		`#!/bin/sh\necho "$(basename "$PWD") $*" >> "${join(workspace, "published.log")}"\n`,
	);
	chmodSync(join(bin, "wrangler"), 0o755);

	const valid = {
		"mechanisms/incident-triage.mdx": MECHANISM,
		"toolkit/incident-triage--classify.mdx": tool(
			"classify",
			"incident-triage",
			10,
		),
	};
	writeBook("clean-book", valid);
	writeBook("broken-book", {
		...valid,
		[BROKEN_TOOL]: tool("write-postmortem", "root-cause-analysis", 45),
	});
});

afterAll(() => {
	rmSync(workspace, { recursive: true, force: true });
});

describe("bookkit deploy", () => {
	it("refuses to publish a book whose content fails validation, naming the file and the fix", () => {
		const result = deploy("broken-book");

		expect(result.published).toEqual([]);
		expect(result.status).not.toBe(0);
		expect(result.output).toContain(
			"Refusing to deploy broken-book: its content failed validation.",
		);
		expect(result.output).toContain(
			`apps/broken-book/src/content/book/${BROKEN_TOOL}: Action primitive timebox error`,
		);
		expect(result.output).toContain("fix: Set timeboxMinutes to 10 or less");
		expect(result.output).toContain(
			`apps/broken-book/src/content/book/${BROKEN_TOOL}: Tool references unknown mechanism "root-cause-analysis"`,
		);
		expect(result.output).toContain(
			"add mechanisms/root-cause-analysis.mdx first",
		);
	});

	it("checks a clean book's content, then publishes it", () => {
		const result = deploy("clean-book");

		expect(result.status).toBe(0);
		expect(result.output).toContain(
			"CONTENT clean-book: ok (0 error(s), 0 warning(s))",
		);
		expect(result.published).toEqual(["clean-book deploy --dry-run"]);
	});

	it("never publishes the broken book when deploying every book", () => {
		const result = deploy();

		expect(result.status).not.toBe(0);
		expect(result.published.join("\n")).not.toContain("broken-book");
	});
});
