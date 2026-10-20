import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoRoot } from "./_lib";

/**
 * `bookkit` itself: what it prints with no command, and its exit code when a
 * command it runs never starts or is killed.
 */

const bookkit = (cwd: string, args: string[], env?: Record<string, string>) => {
	const result = Bun.spawnSync(
		[process.execPath, join(repoRoot(), "scripts", "bookkit.ts"), ...args],
		{
			cwd,
			env: { ...process.env, ...env },
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	return {
		status: result.exitCode,
		output: `${result.stdout.toString()}${result.stderr.toString()}`,
	};
};

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

describe("bookkit exit codes", () => {
	let workspace: string;

	beforeAll(() => {
		workspace = mkdtempSync(join(tmpdir(), "bookkit-cli-"));
		mkdirSync(join(workspace, "apps", "a-book"), { recursive: true });
		// The real scripts, except a validate-book that is killed as it starts.
		const scripts = join(workspace, "scripts");
		mkdirSync(scripts);
		for (const entry of readdirSync(join(repoRoot(), "scripts"))) {
			if (entry === "validate-book.ts") continue;
			symlinkSync(join(repoRoot(), "scripts", entry), join(scripts, entry));
		}
		writeFileSync(
			join(scripts, "validate-book.ts"),
			'process.kill(process.pid, "SIGKILL");\n',
		);
	});

	afterAll(() => {
		rmSync(workspace, { recursive: true, force: true });
	});

	it("fails when the command it ran was killed", () => {
		const result = bookkit(workspace, ["validate", "a-book"]);
		expect(result.status).toBe(1);
		expect(result.output).toContain(
			"scripts/validate-book.ts was stopped by SIGKILL",
		);
	});

	it("fails when the command it runs is not on PATH", () => {
		const result = bookkit(workspace, ["dev", "stop", "a-book"], { PATH: "" });
		expect(result.status).toBe(1);
		expect(result.output).toContain("Could not run astro dev stop");
	});

	it("builds with its own bun, so PATH cannot turn a build into a pass", () => {
		// No package.json here, so the build itself fails; it must not exit 0.
		const result = bookkit(workspace, ["build", "a-book"], { PATH: "" });
		expect(result.status).not.toBe(0);
		expect(result.output).not.toContain("Could not run");
	});
});

describe("bookkit new and check with a current book", () => {
	let workspace: string;

	beforeAll(() => {
		workspace = mkdtempSync(join(tmpdir(), "bookkit-new-"));
		mkdirSync(join(workspace, "apps", "a-book", "src", "content", "book"), {
			recursive: true,
		});
		mkdirSync(join(workspace, "apps", "b-book"), { recursive: true });
		mkdirSync(join(workspace, "scripts"));
		for (const entry of readdirSync(join(repoRoot(), "scripts"))) {
			symlinkSync(
				join(repoRoot(), "scripts", entry),
				join(workspace, "scripts", entry),
			);
		}
		expect(bookkit(workspace, ["use", "a-book"]).status).toBe(0);
	});

	afterAll(() => {
		rmSync(workspace, { recursive: true, force: true });
	});

	it("takes the title as the title when --definition follows it", () => {
		const result = bookkit(workspace, [
			"new",
			"mechanism",
			"Queue reset",
			"--definition",
			"Sending people to the back of the line on any error.",
		]);
		expect(result.output).not.toContain("not found");
		expect(result.status).toBe(0);
		expect(
			readdirSync(
				join(
					workspace,
					"apps",
					"a-book",
					"src",
					"content",
					"book",
					"mechanisms",
				),
			),
		).toEqual(["queue-reset.mdx"]);
	});

	it("names an option new does not have, instead of reading it as a title", () => {
		const result = bookkit(workspace, [
			"new",
			"chapter",
			"Who holds the lever",
			"--aftr",
			"intro",
		]);
		expect(result.status).toBe(1);
		expect(result.output).toContain("new chapter has no option --aftr.");
	});

	it("check with no book checks the current one", () => {
		const result = bookkit(workspace, ["check", "--quick"]);
		expect(result.output).toContain(
			"(a-book is the current book; add --all for every book.)",
		);
		expect(result.output).toContain("Structure of a-book");
	});
});
