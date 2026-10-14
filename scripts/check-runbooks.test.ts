import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoRoot } from "./_lib";

/**
 * check:runbooks --mode error judges review cadence against today, except in
 * a book that names the day its fixture dates belong to (reviewsAsOf).
 */

let workspace: string;

const runbooks = (cwd: string, book?: string) => {
	const result = Bun.spawnSync(
		[
			process.execPath,
			join(repoRoot(), "scripts", "check-runbooks.ts"),
			"--mode",
			"error",
			...(book ? ["--book", book] : []),
		],
		{ cwd, stdout: "pipe", stderr: "pipe" },
	);
	return {
		status: result.exitCode,
		output: `${result.stdout.toString()}${result.stderr.toString()}`,
	};
};

const writeRunbookBook = (book: string, configExtra: string) => {
	const app = join(workspace, "apps", book);
	const content = join(app, "src", "content", "book");
	for (const dir of ["mechanisms", "toolkit", "releases"]) {
		mkdirSync(join(content, dir), { recursive: true });
	}
	writeFileSync(
		join(app, "src", "book.config.ts"),
		`export const bookConfig = {\n\tslug: "${book}",\n${configExtra}\tframe: { slug: "runbook", steps: [], intent: "" },\n};\n`,
	);
	writeFileSync(
		join(content, "mechanisms", "triage.mdx"),
		'---\nslug: triage\ntitle: "Triage"\nsatisfies: ["INC-01"]\n---\n',
	);
	writeFileSync(
		join(content, "toolkit", "triage--classify.mdx"),
		'---\nslug: classify\nmechanism: triage\nname: "Classify"\nowner: "On-call lead"\nreviewEveryDays: 30\ndrills: ["Quarterly game day"]\nsatisfies: ["INC-01"]\nescalation:\n  to: "Incident commander"\n  when: "Sev-1"\n---\n',
	);
	writeFileSync(
		join(content, "releases", "2020-01-01-first.mdx"),
		'---\nversion: "1.0.0"\ndate: "2020-01-01"\ntitle: "First"\nchangedSections: ["toolkit"]\n---\n',
	);
};

beforeAll(() => {
	workspace = mkdtempSync(join(tmpdir(), "bookkit-runbooks-"));
	writeRunbookBook("real", "");
	writeRunbookBook("example", '\treviewsAsOf: "2020-01-02",\n');
});

afterAll(() => {
	rmSync(workspace, { recursive: true, force: true });
});

describe("check:runbooks review dates", () => {
	it("still fails a real runbook whose review is overdue", () => {
		const result = runbooks(workspace, "real");
		expect(result.status).toBe(1);
		expect(result.output).toContain("review was due 2020-01-31");
	});

	it("judges an example's fixture dates on the day it names, and says so", () => {
		const result = runbooks(workspace, "example");
		expect(result.status).toBe(0);
		expect(result.output).toContain("judged as of 2020-01-02");
	});

	it("passes for this repository's books", () => {
		expect(runbooks(repoRoot()).status).toBe(0);
	});
});
