import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** The create-bookkit command's refusals, run in a scratch folder. */

const repoRoot = join(import.meta.dir, "../../..");
let cwd: string;

const createBookkit = (...args: string[]) => {
	const result = Bun.spawnSync(
		[process.execPath, join(import.meta.dir, "index.ts"), ...args],
		{ cwd, stdout: "pipe", stderr: "pipe" },
	);
	return {
		status: result.exitCode,
		output: `${result.stdout.toString()}${result.stderr.toString()}`,
	};
};

beforeEach(() => {
	cwd = mkdtempSync(join(tmpdir(), "create-bookkit-cli-"));
});

afterEach(() => {
	rmSync(cwd, { recursive: true, force: true });
});

describe("create-bookkit", () => {
	it("prints usage for --help and for a missing folder, creating nothing", () => {
		const help = createBookkit("--help");
		expect(help.status).toBe(0);
		expect(help.output).toContain("Usage:");

		const missing = createBookkit("--book", "foo");
		expect(missing.status).toBe(1);
		expect(missing.output).toContain("Missing the project folder.");
		expect(readdirSync(cwd)).toEqual([]);
	});

	it("refuses a folder inside the bookkit repository", () => {
		const result = createBookkit(join(repoRoot, "my-book"));
		expect(result.status).toBe(1);
		expect(result.output).toContain("is inside the bookkit repository");
		expect(existsSync(join(repoRoot, "my-book"))).toBe(false);
	});

	it("refuses a folder with files unless --force, and --force never overwrites", () => {
		mkdirSync(join(cwd, "book"));
		writeFileSync(join(cwd, "book", "package.json"), "{}\n");

		const refused = createBookkit("book");
		expect(refused.status).toBe(1);
		expect(refused.output).toContain("is not empty (package.json)");

		const forced = createBookkit("book", "--force");
		expect(forced.status).toBe(1);
		expect(forced.output).toContain("would overwrite them:\n  package.json");
		expect(forced.output).toContain("Nothing was written.");
		expect(readdirSync(join(cwd, "book"))).toEqual(["package.json"]);
	});

	it("upgrades only a Bookkit project", () => {
		mkdirSync(join(cwd, "notes"));
		const result = createBookkit("notes", "--upgrade");
		expect(result.status).toBe(1);
		expect(result.output).toContain("is not a Bookkit project");
		expect(readdirSync(join(cwd, "notes"))).toEqual([]);
	});

	it("sends a second create to --upgrade", () => {
		expect(createBookkit("garden").status).toBe(0);
		const again = createBookkit("garden", "--force");
		expect(again.status).toBe(1);
		expect(again.output).toContain(
			"is already a Bookkit project. To update its engine and wrappers, run with --upgrade",
		);
	});
});
