import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoRoot } from "./_lib";
import { runChild, waitForChildren } from "./lib/child-process.fixture";

/**
 * check:corpus in a workspace whose corpus.json still names books that are
 * gone, as in a fork that removed this repository's books.
 */

let workspace: string;

const mechanism = (slug: string, definition: string) => `---
slug: ${slug}
title: "${slug}"
definition: "${definition}"
---
`;

const writeBook = (book: string, files: Record<string, string>) => {
	const dir = join(
		workspace,
		"apps",
		book,
		"src",
		"content",
		"book",
		"mechanisms",
	);
	mkdirSync(dir, { recursive: true });
	for (const [slug, source] of Object.entries(files)) {
		writeFileSync(join(dir, `${slug}.mdx`), source);
	}
};

waitForChildren();

const checkCorpus = (...args: string[]) =>
	runChild(
		[
			process.execPath,
			join(repoRoot(), "scripts", "check-corpus.ts"),
			"--no-semantic",
			"--mode",
			"error",
			...args,
		],
		{ cwd: workspace },
	);

beforeAll(() => {
	workspace = mkdtempSync(join(tmpdir(), "bookkit-corpus-"));
	writeFileSync(
		join(workspace, "corpus.json"),
		JSON.stringify({
			books: ["gone-book", "kept-book"],
			distinct: [
				{ pair: ["gone-a", "gone-b"], reason: "Ruled on a removed book." },
			],
		}),
	);
	writeBook("kept-book", {
		"tide-timing": mechanism(
			"tide-timing",
			"When the tide turns decides who gets stranded.",
		),
	});
	writeBook("new-book", {
		"new-book-starter-mechanism": mechanism("new-book-starter-mechanism", ""),
	});
});

afterAll(() => {
	rmSync(workspace, { recursive: true, force: true });
});

describe("check:corpus", () => {
	it("checks the corpus books that exist, and names the missing ones without failing", () => {
		const result = checkCorpus();
		expect(result.output).toContain(
			"corpus.json lists book(s) not in apps/: gone-book. They are left out, with their rulings.",
		);
		expect(result.output).toContain(
			'shared corpus (corpus.json "books"): kept-book',
		);
		expect(result.output).not.toContain("STALE DECISION");
		expect(result.status).toBe(0);
	});

	it("still refuses a book named with --books that does not exist", () => {
		const result = checkCorpus("--books", "gone-book");
		expect(result.output).toContain("Unknown book(s): gone-book.");
		expect(result.status).toBe(1);
	});

	it("leaves a mechanism with no definition out of the comparison", () => {
		const result = checkCorpus("--books", "kept-book,new-book");
		expect(result.output).toContain(
			"not compared until they have a definition: new-book-starter-mechanism",
		);
		expect(result.status).toBe(0);
	});
});
