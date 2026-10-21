import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultFrames } from "../packages/astro-bookkit/src/frames/defaults";
import { checkBookContent } from "../packages/astro-bookkit/src/validators/book-validator";
import { listFilesRecursive, repoRoot } from "./_lib";
import { runChild, waitForChildren } from "./lib/child-process.fixture";
import { starterSlugs } from "./lib/scaffold-book";

/**
 * `new:book` in a scratch workspace that has the engine but none of this
 * repository's books, the way a fork that removed them looks. The new book
 * must pass the gates CI runs on every book: Biome, both type checks, content
 * validation, and the cross-book mechanism check.
 */

const repo = repoRoot();
let workspace: string;

waitForChildren();

const run = (command: string[], cwd = workspace) =>
	runChild(command, {
		cwd,
		env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
	});

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
		"scripts",
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

	it("gets the shared home page, with its copy in book.config.ts", () => {
		const appDir = join(workspace, "apps", "tide-pool");
		expect(
			readFileSync(join(appDir, "src", "pages", "index.astro"), "utf8"),
		).toBe(
			readFileSync(
				join(
					repo,
					"packages",
					"astro-bookkit",
					"templates",
					"book-app",
					"src",
					"pages",
					"index.astro",
				),
				"utf8",
			),
		);
		const config = readFileSync(join(appDir, "src", "book.config.ts"), "utf8");
		expect(config).toContain('kicker: "",');
		expect(config).toContain('title: "Browse the mechanisms",');
	});

	it("gets the shared reading hub, with its copy in book.config.ts", () => {
		const appDir = join(workspace, "apps", "tide-pool");
		expect(
			readFileSync(join(appDir, "src", "lib", "read-hub.ts"), "utf8"),
		).toBe(
			readFileSync(
				join(
					repo,
					"packages",
					"astro-bookkit",
					"templates",
					"book-app",
					"src",
					"lib",
					"read-hub.ts",
				),
				"utf8",
			),
		);
		const config = readFileSync(join(appDir, "src", "book.config.ts"), "utf8");
		expect(config).toContain("readHub: {");
		// No cards of its own, so the hub's default cards end with chapter 1.
		expect(config).not.toContain("quickStartCards: [");
	});

	it("gets the shared mechanisms index, with its copy in book.config.ts", () => {
		const appDir = join(workspace, "apps", "tide-pool");
		const page = join("src", "pages", "read", "mechanisms", "index.astro");
		expect(readFileSync(join(appDir, page), "utf8")).toBe(
			readFileSync(
				join(repo, "packages", "astro-bookkit", "templates", "book-app", page),
				"utf8",
			),
		);
		const config = readFileSync(join(appDir, "src", "book.config.ts"), "utf8");
		expect(config).toContain("mechanismsIndex: {");
		expect(config).toContain("urgency: {},");
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

	it("starts on the frame --frame names, with the overview's headings to match", () => {
		const made = newBook("--book", "pager-notes", "--frame", "runbook");
		expect(made.status).toBe(0);
		const app = join(workspace, "apps", "pager-notes");
		const config = readFileSync(join(app, "src", "book.config.ts"), "utf8");
		expect(config).toContain('slug: "runbook"');
		expect(config).not.toContain('"recognition"');
		const overview = readFileSync(
			join(app, "src", "content", "book", "chapters", "00-overview.mdx"),
			"utf8",
		);
		expect(overview).toContain("## Ownership");
		const errors = checkBookContent({
			workspaceRoot: workspace,
			bookSlug: "pager-notes",
		}).findings.filter((finding) => finding.level === "error");
		expect(errors).toEqual([]);
		const unknown = newBook("--book", "other-notes", "--frame", "runbok");
		expect(unknown.status).toBe(1);
		expect(unknown.output).toContain(
			'No frame "runbok". Did you mean runbook? Frames: intervention',
		);
		expect(existsSync(join(workspace, "apps", "other-notes"))).toBe(false);
	});

	it("starts every frame's overview with a heading the frame check counts for each step", () => {
		for (const frame of defaultFrames) {
			const book = `${frame.slug}-frame`;
			expect(newBook("--book", book, "--frame", frame.slug).status).toBe(0);
			const missing = checkBookContent({
				workspaceRoot: workspace,
				bookSlug: book,
			}).findings.filter((finding) => finding.code === "FRAME_STEP_MISSING");
			expect({ frame: frame.slug, missing }).toEqual({
				frame: frame.slug,
				missing: [],
			});
		}
	});

	it("bookkit new book --from imports notes with no starter content beside them, on the frame given", () => {
		const notes = join(workspace, "pager-notes-src");
		mkdirSync(notes, { recursive: true });
		writeFileSync(
			join(notes, "01-why.md"),
			"# Why handoffs fail\n\nMost incidents fail at the handoff.\n",
		);
		writeFileSync(
			join(notes, "02-rhythm.md"),
			"# Shift rhythm\n\nA shift has three beats.\n",
		);
		const made = run([
			process.execPath,
			join(repo, "scripts", "bookkit.ts"),
			"new",
			"book",
			"handoffs",
			"--frame",
			"runbook",
			"--from",
			notes,
			"--no-install",
		]);
		expect(made.status).toBe(0);
		const content = join(
			workspace,
			"apps",
			"handoffs",
			"src",
			"content",
			"book",
		);
		expect(
			listFilesRecursive(content).filter((file) => file.endsWith(".mdx")),
		).toEqual(["chapters/01-why.mdx", "chapters/02-rhythm.mdx"]);
		expect(
			readFileSync(
				join(workspace, "apps", "handoffs", "src", "book.config.ts"),
				"utf8",
			),
		).toContain('slug: "runbook"');
		// The new book is the current one.
		expect(
			JSON.parse(
				readFileSync(join(workspace, ".bookkit", "local.json"), "utf8"),
			),
		).toEqual({ book: "handoffs" });
	});

	it("refuses an existing book", () => {
		const again = newBook("--book", "second-book");
		expect(again.status).toBe(1);
		expect(again.output).toContain("apps/second-book already exists");
	});
});

describe("new:tool, new:mechanism, new:example", () => {
	const script = (name: string, ...args: string[]) =>
		run([process.execPath, join(repo, "scripts", name), ...args]);
	const content = (...path: string[]) =>
		join(workspace, "apps", "second-book", "src", "content", "book", ...path);

	it("names a tool <mechanism>--<name>", () => {
		const mechanism = starterSlugs("second-book").mechanism;
		const result = script(
			"scaffold-tool.ts",
			"--book",
			"second-book",
			"--mechanism",
			mechanism,
			"--name",
			"Classify the alert",
		);
		expect(result.status).toBe(0);
		expect(
			existsSync(content("toolkit", `${mechanism}--classify-the-alert.mdx`)),
		).toBe(true);
	});

	it("writes --definition into a new mechanism, so it is not typed twice", () => {
		const result = script(
			"scaffold-mechanism.ts",
			"--book",
			"second-book",
			"--slug",
			"queue-reset",
			"--title",
			"Queue reset",
			"--definition",
			'Sending people to the back of the line on any "error".',
		);
		expect(result.status).toBe(0);
		expect(result.output).not.toContain("write the definition");
		const written = readFileSync(
			content("mechanisms", "queue-reset.mdx"),
			"utf8",
		);
		expect(written).toContain(
			'definition: "Sending people to the back of the line on any \\"error\\"."',
		);
	});

	it("refuses a book or mechanism that does not exist, creating nothing", () => {
		const noBook = script(
			"scaffold-mechanism.ts",
			"--book",
			"secnd-book",
			"--slug",
			"x",
		);
		expect(noBook.status).toBe(1);
		expect(noBook.output).toContain(
			'No book "secnd-book" in apps/. Did you mean second-book?',
		);
		expect(existsSync(join(workspace, "apps", "secnd-book"))).toBe(false);

		const noMechanism = script(
			"scaffold-example.ts",
			"--book",
			"second-book",
			"--mechanism",
			"missing",
			"--domain",
			"Housing",
		);
		expect(noMechanism.status).toBe(1);
		expect(noMechanism.output).toContain(
			'second-book has no mechanism "missing"',
		);
		expect(existsSync(content("examples", "missing"))).toBe(false);
	});
});
