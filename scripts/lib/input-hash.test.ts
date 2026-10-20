import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashInputs } from "./input-hash";

/**
 * hashInputs in a scratch git repository: what changes the hash of a
 * project's inputs, and what does not.
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
