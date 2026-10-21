import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { repoRoot } from "./_lib";
import { runChild, waitForChildren } from "./lib/child-process.fixture";

waitForChildren();

// Reads the repository's books; writes nothing.
const validate = (...args: string[]) =>
	runChild(
		[process.execPath, join(repoRoot(), "scripts", "validate-all.ts"), ...args],
		{
			cwd: repoRoot(),
		},
	);

describe("bun run validate", () => {
	it("checks only the book --book names", () => {
		const result = validate("--book", "on-call");
		expect(result.status).toBe(0);
		expect(result.stdout.match(/^VALIDATE /gm)).toHaveLength(1);
		expect(result.stdout).toContain("VALIDATE on-call");
		expect(result.stdout).toContain("1 book validated with no errors");
	});

	it("prints one JSON document for --book with --json", () => {
		const result = validate("--book", "on-call", "--json");
		expect(result.status).toBe(0);
		expect(JSON.parse(result.stdout).book).toBe("on-call");
	});

	it("refuses an option it would otherwise ignore", () => {
		const result = validate("--bok", "on-call");
		expect(result.status).toBe(1);
		expect(result.stderr).toContain(
			"Unknown option --bok. Did you mean --book?",
		);
	});

	it("refuses --json for every book, which would be several documents", () => {
		const result = validate("--json");
		expect(result.status).toBe(1);
		expect(result.stderr).toContain(
			"--json reports one book: add --book <book>",
		);
	});

	it("names the closest book for a misspelled one", () => {
		const result = validate("--book", "on-cal");
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("Did you mean on-call?");
	});
});
