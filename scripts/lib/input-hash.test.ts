import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashInputs, listInputFiles, notIgnoredFiles } from "./input-hash";

/**
 * hashInputs in a scratch git repository: what changes the hash of a
 * project's inputs, and what does not. Then the same without git: a new
 * project before `git init`, whose files are read from the disk.
 */

let repo: string;

const write = (path: string, text: string) => {
	mkdirSync(join(repo, path, ".."), { recursive: true });
	writeFileSync(join(repo, path), text);
};

const git = (...args: string[]) =>
	Bun.spawnSync(["git", ...args], {
		cwd: repo,
		stdout: "pipe",
		stderr: "pipe",
	});

const hash = () => hashInputs(repo, ["app", "bun.lock"], ["app/.astro"]);

beforeAll(() => {
	repo = mkdtempSync(join(tmpdir(), "bookkit-input-hash-"));
	git("init", "--quiet");
	write(".gitignore", "dist/\n.astro/\n");
	write("app/src/page.ts", "export const a = 1;\n");
	write("app/dist/out.js", "built\n");
	write("bun.lock", "lock 1\n");
	write("other/readme.md", "not an input\n");
	git("add", "-A");
});

afterAll(() => {
	rmSync(repo, { recursive: true, force: true });
});

describe("hashInputs", () => {
	it("is stable while nothing it reads changes", () => {
		const before = hash();
		write("other/readme.md", "still not an input\n");
		write("app/dist/out.js", "rebuilt\n");
		expect(hash()).toBe(before);
	});

	it("changes with a file's content, a new untracked file, or a deleted one", () => {
		const before = hash();
		write("app/src/page.ts", "export const a = 2;\n");
		const edited = hash();
		expect(edited).not.toBe(before);

		write("app/src/new.ts", "export const b = 1;\n");
		const added = hash();
		expect(added).not.toBe(edited);

		unlinkSync(join(repo, "app/src/page.ts"));
		expect(hash()).not.toBe(added);
	});

	it("counts a named file such as the lockfile", () => {
		const before = hash();
		write("bun.lock", "lock 2\n");
		expect(hash()).not.toBe(before);
	});

	it("counts ignored files it is told to, such as Astro's generated types", () => {
		const before = hash();
		write("app/.astro/types.d.ts", "declare const x: 1;\n");
		const generated = hash();
		expect(generated).not.toBe(before);
		write("app/.astro/types.d.ts", "declare const x: 2;\n");
		expect(hash()).not.toBe(generated);
	});
});

/** A folder with no repository above it, holding what a project's .gitignore files can say. */
const ignoreCases: Record<string, string> = {
	".gitignore": [
		"# a comment, and a blank line",
		"",
		"node_modules/",
		"*.log",
		"!keep.log",
		"/top-only.txt",
		"build/",
		"docs/**/draft-*.md",
		"logs/**",
		"!logs/kept.txt",
		"cache/",
		"!cache/inside.txt",
		"file[0-9].tmp",
		"\\#hash.txt",
		"trailing.txt   ",
		"",
	].join("\n"),
	"top-only.txt": "ignored at the top",
	"app/top-only.txt": "kept: the rule is anchored to the root",
	"app/src/page.ts": "export const a = 1;",
	"app/src/debug.log": "ignored anywhere",
	"app/src/keep.log": "kept by a later !rule",
	"app/node_modules/dep/index.js": "ignored folder",
	"app/build": "kept: a file, and build/ matches folders only",
	"app/dist/out.js": "ignored by app/.gitignore",
	"app/.gitignore": "dist/\n!src/debug.log\n",
	"docs/a/b/draft-1.md": "ignored by **",
	"docs/a/final.md": "kept",
	"logs/x/y.txt": "ignored by logs/**",
	"logs/kept.txt": "kept by a later !rule",
	"cache/inside.txt": "ignored: its folder is ignored",
	"file1.tmp": "ignored by a class",
	"fileX.tmp": "kept",
	"#hash.txt": "ignored by an escaped #",
	"trailing.txt": "ignored: trailing spaces do not count",
	"other/readme.md": "not an input",
};

describe("without git", () => {
	let project: string;
	const inputs = [
		"app",
		"docs",
		"logs",
		"cache",
		"top-only.txt",
		"file1.tmp",
		"fileX.tmp",
		"#hash.txt",
		"trailing.txt",
	];

	beforeAll(() => {
		project = mkdtempSync(join(tmpdir(), "bookkit-no-git-"));
		for (const [path, text] of Object.entries(ignoreCases)) {
			mkdirSync(join(project, path, ".."), { recursive: true });
			writeFileSync(join(project, path), text);
		}
		symlinkSync(join(project, "docs"), join(project, "app", "linked-docs"));
	});

	afterAll(() => {
		rmSync(project, { recursive: true, force: true });
	});

	it("lists what git would list once the folder is a repository", () => {
		const listed = listInputFiles(project, inputs);
		expect(listed).toEqual(notIgnoredFiles(project, inputs));
		expect(listed).toEqual([
			"app/.gitignore",
			"app/build",
			"app/linked-docs",
			"app/src/debug.log",
			"app/src/keep.log",
			"app/src/page.ts",
			"app/top-only.txt",
			"docs/a/final.md",
			"fileX.tmp",
			"logs/kept.txt",
		]);
		// Isolated from this machine's git config, such as a global excludes file.
		const env = {
			...process.env,
			GIT_CONFIG_GLOBAL: "/dev/null",
			GIT_CONFIG_NOSYSTEM: "1",
		};
		const copy = mkdtempSync(join(tmpdir(), "bookkit-git-view-"));
		try {
			Bun.spawnSync(["cp", "-R", `${project}/.`, copy]);
			Bun.spawnSync(["git", "init", "--quiet"], { cwd: copy, env });
			const byGit = Bun.spawnSync(
				["git", "ls-files", "--others", "--exclude-standard", "--", ...inputs],
				{ cwd: copy, env, stdout: "pipe" },
			)
				.stdout.toString()
				.split("\n")
				.filter(Boolean)
				.sort();
			expect(listed).toEqual(byGit);
		} finally {
			rmSync(copy, { recursive: true, force: true });
		}
	});

	it("hashes a project that is not a repository yet", () => {
		const before = hashInputs(project, inputs);
		expect(hashInputs(project, inputs)).toBe(before);
		writeFileSync(join(project, "app/dist/out.js"), "rebuilt");
		writeFileSync(join(project, "other/readme.md"), "changed");
		expect(hashInputs(project, inputs)).toBe(before);
		writeFileSync(join(project, "app/src/page.ts"), "export const a = 2;");
		expect(hashInputs(project, inputs)).not.toBe(before);
	});
});
