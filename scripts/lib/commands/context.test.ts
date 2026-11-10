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
import { dirname, join } from "node:path";
import { repoRoot } from "../../_lib";
import { runChild, waitForChildren } from "../child-process.fixture";

/**
 * What the commands share: `bookkit`'s exit code when a command it runs never
 * starts or is killed, and the book a command acts on when none is named
 * (the current book, or a project's only one).
 */

waitForChildren();

const bookkit = (cwd: string, args: string[], env?: Record<string, string>) =>
	runChild(
		[process.execPath, join(repoRoot(), "scripts", "bookkit.ts"), ...args],
		{ cwd, env: { ...process.env, ...env } },
	);

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

	it("validate with no book validates the current one, and --all every book", () => {
		const current = bookkit(workspace, ["validate"]);
		expect(current.output).toContain(
			"(a-book is the current book; add --all for every book.)",
		);
		expect(current.output).toContain("apps/a-book/src/content/book");
		expect(current.output).not.toContain("b-book");
		const every = bookkit(workspace, ["validate", "--all"]);
		expect(every.output).not.toContain("current book");
		expect(every.output).toMatch(/\b2 books\b/);
	});

	it("propose names an option it does not have, and the nearest one", () => {
		const result = bookkit(workspace, ["propose", "--aply", "mechanisms"]);
		expect(result.status).toBe(1);
		expect(result.output).toContain(
			"Unknown option --aply. Did you mean --apply?\nUsage: bun run bookkit propose",
		);
	});
});

describe("one book", () => {
	let workspace: string;

	const CHAPTER =
		"---\nslug: start\ntitle: Start\nsummary: Where it starts.\nstatus: draft\n---\n\nText.\n";

	const FILES: Record<string, string> = {
		"apps/solo/src/book.config.ts":
			'export const bookConfig = {\n\tslug: "solo",\n\ttitle: "Solo",\n\tstatus: "draft",\n\tsite: { url: "https://solo.example" },\n\trecords: [{ status: "kept" }],\n};\n',
		"apps/solo/src/content/book/chapters/01-start.mdx": CHAPTER,
	};

	const at = (path: string) => join(workspace, path);

	beforeAll(() => {
		workspace = mkdtempSync(join(tmpdir(), "bookkit-one-book-"));
		symlinkSync(join(repoRoot(), "scripts"), join(workspace, "scripts"));
		for (const section of [
			"chapters",
			"mechanisms",
			"toolkit",
			"examples",
			"glossary",
		]) {
			mkdirSync(at(`apps/solo/src/content/book/${section}`), {
				recursive: true,
			});
		}
		for (const [path, text] of Object.entries(FILES)) {
			mkdirSync(dirname(at(path)), { recursive: true });
			writeFileSync(at(path), text);
		}
	});

	afterAll(() => {
		rmSync(workspace, { recursive: true, force: true });
	});

	it("is the book a command acts on when none is named", () => {
		const made = bookkit(workspace, ["new", "chapter", "Second thoughts"]);
		expect(made.status).toBe(0);
		expect(made.output).toContain(
			"apps/solo/src/content/book/chapters/02-second-thoughts.mdx",
		);
		rmSync(at("apps/solo/src/content/book/chapters/02-second-thoughts.mdx"));
	});
});
