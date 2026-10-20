import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { repoRoot } from "./_lib";
import { runChild, waitForChildren } from "./lib/child-process.fixture";

waitForChildren();

const run = (args: string[], script = "import-book-from-markdown.ts") =>
	runChild([process.execPath, join(repoRoot(), "scripts", script), ...args], {
		cwd: repoRoot(),
	});

describe("import-book-from-markdown arguments", () => {
	it("prints its usage and an example, not a bare error, when arguments are missing", () => {
		const result = run([]);
		expect(result.status).toBe(1);
		expect(result.output).toContain("Missing --book <book>, --dir <dir>.");
		expect(result.output).toContain(
			"bun run bookkit import <book> --dir <folder> [--dry-run]",
		);
		expect(result.output).toContain("--include-readme");
		expect(result.output).toMatch(
			/Example:\n {2}bun run bookkit import [a-z-]+ --dir ~\/notes\/runbooks --dry-run/,
		);
		expect(result.output).not.toContain("Missing required arg");
	});

	it("names the one missing flag when bookkit import is given only a book", () => {
		const result = run(["import", "on-call"], "bookkit.ts");
		expect(result.status).toBe(1);
		expect(result.output).toContain("Missing --dir <dir>.");
		expect(result.output).toContain("Usage:");
	});

	it("prints the usage on --help and exits 0", () => {
		const result = run(["--help"]);
		expect(result.status).toBe(0);
		expect(result.output).toContain("Import a folder of Markdown notes");
	});

	it("suggests the flag a typo meant", () => {
		const result = run(["--book", "on-call", "--dir", "x", "--dryrun"]);
		expect(result.status).toBe(1);
		expect(result.output).toContain(
			"Unknown option --dryrun. Did you mean --dry-run?",
		);
	});
});
