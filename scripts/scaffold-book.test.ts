import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkBookContent } from "../packages/astro-bookkit/src/validators/book-validator";
import { listFilesRecursive, repoRoot } from "./_lib";
import { starterSlugs } from "./lib/scaffold-book";

/**
 * `new:book` in a scratch workspace that has the engine but none of this
 * repository's books, the way a fork that removed them looks. The new book
 * must pass the gates CI runs on every book: Biome, both type checks, content
 * validation, and the cross-book mechanism check.
 */

const repo = repoRoot();
let workspace: string;

const run = (command: string[], cwd = workspace) => {
	const result = Bun.spawnSync(command, {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
		env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
	});
	return {
		status: result.exitCode,
		output: `${result.stdout.toString()}${result.stderr.toString()}`,
	};
};

// --no-install: the workspace borrows this repository's node_modules.
const newBook = (...args: string[]) =>
	run([
		process.execPath,
		join(repo, "scripts", "scaffold-book.ts"),
		...args,
		"--no-install",
	]);

const TITLE =
	'Tide "Pool" Notes: a title long enough to wrap in book.config.ts';

beforeAll(() => {
	workspace = mkdtempSync(join(tmpdir(), "bookkit-new-book-"));
	for (const entry of [
		"packages",
		"node_modules",
		"tsconfig.base.json",
		"biome.json",
	]) {
		symlinkSync(join(repo, entry), join(workspace, entry));
	}
	writeFileSync(
		join(workspace, ".gitignore"),
		"node_modules/\ndist/\n.astro/\n",
	);
	expect(newBook("--book", "tide-pool", "--title", TITLE).status).toBe(0);
	expect(newBook("--book", "second-book").status).toBe(0);
});

afterAll(() => {
	rmSync(workspace, { recursive: true, force: true });
});

describe("new:book", () => {
	it("starts from the engine's starter, with nothing from another book", () => {
		const appDir = join(workspace, "apps", "tide-pool");
		const text = listFilesRecursive(appDir)
			.map((file) => readFileSync(join(appDir, file), "utf8"))
			.join("\n");
		for (const authorBook of [
			"bad-people",
			"Bad People",
			"on-call",
			"running-hot",
			"crumple-zone",
		]) {
			expect(text).not.toContain(authorBook);
		}
		expect(
			readFileSync(join(appDir, "src", "book.config.ts"), "utf8"),
		).toContain("relatedBooks: [],");
	});

	it("gives each book its own starter slugs", () => {
		const slugs = (book: string) =>
			readdirSync(
				join(workspace, "apps", book, "src", "content", "book", "mechanisms"),
			);
		expect(slugs("tide-pool")).toEqual([
			`${starterSlugs("tide-pool").mechanism}.mdx`,
		]);
		expect(slugs("second-book")).toEqual([
			`${starterSlugs("second-book").mechanism}.mdx`,
		]);

		const corpus = run([
			process.execPath,
			join(repo, "scripts", "check-corpus.ts"),
			"--no-semantic",
			"--mode",
			"error",
		]);
		expect(corpus.output).not.toContain("shared across books");
		expect(corpus.output).toContain("No unresolved overlapping mechanisms.");
		expect(corpus.status).toBe(0);
	});

	it("has content with no validation errors", () => {
		const errors = checkBookContent({
			workspaceRoot: workspace,
			bookSlug: "tide-pool",
		}).findings.filter((finding) => finding.level === "error");
		expect(errors).toEqual([]);
	});

	it("passes the shim and TODO checks", () => {
		for (const script of ["check-shims.ts", "check-todos.ts"]) {
			const result = run([process.execPath, join(repo, "scripts", script)]);
			expect(result.output).toContain("passed");
			expect(result.status).toBe(0);
		}
	});

	it("passes Biome as generated", () => {
		const biome = run([
			join(repo, "node_modules", ".bin", "biome"),
			"ci",
			"apps",
		]);
		expect(biome.output).not.toContain("differs from formatting");
		expect(biome.status).toBe(0);
	});

	it(
		"type-checks, .ts and .astro",
		() => {
			const appDir = join(workspace, "apps", "tide-pool");
			const tsc = run([
				process.execPath,
				join(repo, "node_modules", "typescript-native", "bin", "tsc"),
				"--noEmit",
				"-p",
				join(appDir, "tsconfig.json"),
			]);
			expect(tsc.output).toBe("");
			expect(tsc.status).toBe(0);
			const astro = run(
				[join(repo, "node_modules", ".bin", "astro"), "check"],
				appDir,
			);
			expect(astro.output).toContain("0 errors");
			expect(astro.status).toBe(0);
		},
		{ timeout: 120_000 },
	);

	it("prints usage for --help, and refuses unknown flags and a missing --book", () => {
		const help = newBook("--help");
		expect(help.status).toBe(0);
		expect(help.output).toContain("Usage:");

		const unknown = newBook("--book", "x-book", "--template", "bad-people");
		expect(unknown.status).toBe(1);
		expect(unknown.output).toContain("Unknown option --template.");
		expect(unknown.output).toContain("Usage:");

		const missing = newBook("--title", "Untitled");
		expect(missing.status).toBe(1);
		expect(missing.output).toContain("Missing --book <book>.");
		expect(existsSync(join(workspace, "apps", "x-book"))).toBe(false);
	});

	it("refuses an existing book", () => {
		const again = newBook("--book", "second-book");
		expect(again.status).toBe(1);
		expect(again.output).toContain("apps/second-book already exists");
	});
});
