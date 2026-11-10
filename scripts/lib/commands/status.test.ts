import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { repoRoot } from "../../_lib";
import { runChild, waitForChildren } from "../child-process.fixture";

/**
 * What `bookkit` prints with no command, which is `status`, and the bet
 * report it keeps behind `bets`.
 */

waitForChildren();

const bookkit = (cwd: string, args: string[], env?: Record<string, string>) =>
	runChild(
		[process.execPath, join(repoRoot(), "scripts", "bookkit.ts"), ...args],
		{ cwd, env: { ...process.env, ...env } },
	);

describe("bookkit with no command", () => {
	it("lists the books and the commands to write, check, preview, build, and deploy one", () => {
		const result = bookkit(repoRoot(), []);
		expect(result.status).toBe(0);
		expect(result.output).toContain("BOOKKIT ·");
		for (const verb of ["write", "check", "preview", "build", "deploy"]) {
			expect(result.output).toMatch(new RegExp(`^ {2}${verb} +\\S`, "m"));
		}
		expect(result.output).toContain("bun run bookkit dev ");
		expect(result.output).toContain("bun run bookkit deploy ");
		// The maintainers' bet is not every author's business.
		expect(result.output).not.toContain("B1");
		expect(result.output).not.toContain("merged away");
		// `status` prints the same, in forks and standalone projects alike.
		const status = bookkit(repoRoot(), ["status"]);
		expect(status.status).toBe(0);
		expect(status.output).toBe(result.output);
	});

	it("keeps the bet report behind its own command", () => {
		const result = bookkit(repoRoot(), ["bets"]);
		expect(result.status).toBe(0);
		expect(result.output).toMatch(/B1(:| ·)/);
		expect(bookkit(repoRoot(), ["status", "--json"]).output).not.toContain(
			'"b1"',
		);
	});
});
