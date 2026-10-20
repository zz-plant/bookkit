import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoRoot } from "./_lib";
import { runChild, waitForChildren } from "./lib/child-process.fixture";

/**
 * validate-book and validate-all against a scratch workspace: a book with five
 * errors in three files, and a clean one.
 */

waitForChildren();

let workspace: string;

const tool = (slug: string, mechanism: string, minutes: number) =>
	`---\nslug: ${slug}\nmechanism: ${mechanism}\nname: "${slug}"\ntrigger: "t"\ntimeboxMinutes: ${minutes}\nsteps: ["s"]\nfailureLooksLike: ["f"]\nlegitimateDemand: ["l"]\n---\n`;

const writeBook = (book: string, files: Record<string, string>) => {
	const content = join(workspace, "apps", book, "src", "content", "book");
	for (const dir of [
		"chapters",
		"mechanisms",
		"toolkit",
		"examples",
		"glossary",
	]) {
		mkdirSync(join(content, dir), { recursive: true });
	}
	for (const [file, source] of Object.entries(files)) {
		writeFileSync(join(content, file), source);
	}
};

const run = (script: string, ...args: string[]) =>
	runChild([process.execPath, join(workspace, "scripts", script), ...args], {
		cwd: workspace,
	});

beforeAll(() => {
	workspace = mkdtempSync(join(tmpdir(), "bookkit-validate-"));
	symlinkSync(join(repoRoot(), "scripts"), join(workspace, "scripts"));
	// The starter template, which names the placeholder text to look for.
	symlinkSync(join(repoRoot(), "packages"), join(workspace, "packages"));
	writeBook("broken-book", {
		// Two errors: unknown mechanism, and a 45-minute timebox.
		"toolkit/a.mdx": tool("a", "no-such-mechanism", 45),
		// One: unknown mechanism.
		"toolkit/b.mdx": tool("b", "also-missing", 5),
		// Two: no slug, no title.
		"chapters/01-untitled.mdx": "---\nstatus: draft\n---\nBody.\n",
	});
	writeBook("mdx-book", {
		"chapters/01-braces.mdx":
			'---\nslug: braces\ntitle: "Braces"\nstatus: draft\n---\nFine prose.\n\nA literal {brace in prose.\n',
	});
	writeBook("placeholder-book", {
		"chapters/01-start.mdx":
			'---\nslug: start\ntitle: "Start"\nstatus: draft\n---\nBody.\n',
	});
	writeFileSync(
		join(workspace, "apps", "placeholder-book", "src", "book.config.ts"),
		`export const bookConfig = {
	slug: "placeholder-book",
	status: "draft",
	site: { url: "https://placeholder-book.book" },
	causalStance:
		"The book's core claim about what causes the problem it covers.",
};
`,
	);
	writeBook("glossary-book", {
		"glossary/pager-queue.mdx":
			'---\nslug: pager-queue\nterm: "Pager queue"\nstatus: draft\ndefinition: "Alerts waiting for an owner."\n---\n',
		"chapters/01-start.mdx":
			'---\nslug: start\ntitle: "Start"\nstatus: draft\n---\nThe pager queue grows.\n\nLink [the pager queue](/read/glossary/pager-queue).\n',
		"chapters/02-next.mdx":
			'---\nslug: next\ntitle: "Next"\nstatus: draft\n---\nSee [the pager queue](/read/glossary/pager-queue) first; the pager queue grows.\n',
	});
	writeBook("clean-book", {
		"chapters/01-start.mdx":
			'---\nslug: start\ntitle: "Start"\nstatus: draft\n---\nBody.\n',
	});
});

afterAll(() => {
	rmSync(workspace, { recursive: true, force: true });
});

describe("validate-book", () => {
	it("exits 1 on errors and lists every one with its fix", () => {
		const result = run("validate-book.ts", "--book", "broken-book");

		expect(result.status).toBe(1);
		expect(result.output).toContain("ERRORS (5)");
		const errorLines = result.output
			.split("\n")
			.filter((line) => line.startsWith("- apps/broken-book/"));
		expect(errorLines).toHaveLength(5);
		expect(result.output.match(/^ {2}fix: /gm)).toHaveLength(5);
		expect(result.output).toContain("✗ broken-book: 5 errors");
	});

	it("still exits 1 when asked for the old warn mode", () => {
		expect(
			run("validate-book.ts", "--book", "broken-book", "--mode", "warn").status,
		).toBe(1);
	});

	it("prints its usage, not a bare error, when --book is missing", () => {
		const result = run("validate-book.ts");
		expect(result.status).toBe(1);
		expect(result.output).toContain("Missing --book <book>.");
		expect(result.output).toContain("Usage:");
	});

	it("compiles the MDX as the build does, naming the line it stops at", () => {
		const result = run("validate-book.ts", "--book", "mdx-book");
		expect(result.status).toBe(1);
		expect(result.output).toContain(
			"- apps/mdx-book/src/content/book/chapters/01-braces.mdx: MDX does not compile at line 8",
		);
	});

	it("names starter text left in book.config.ts, with what to write instead", () => {
		const result = run("validate-book.ts", "--book", "placeholder-book");
		expect(result.status).toBe(0);
		expect(result.output).toContain(
			"apps/placeholder-book/src/book.config.ts still has the starter text for causalStance, which shows on the overview page",
		);
		// https://<slug>.book may be the domain the author means to buy.
		expect(result.output).not.toContain("site.url");
		expect(result.output).toContain(
			"fix: Replace it with the book's core claim about what causes the problem it covers.",
		);
		expect(result.output).not.toContain("objectives.readerStart");
	});

	it("lists each chapter's first unlinked use of a glossary term as info, which never fails", () => {
		const result = run("validate-book.ts", "--book", "glossary-book");
		expect(result.status).toBe(0);
		expect(result.output).toContain(
			"INFO (1): glossary terms a chapter uses before linking them.",
		);
		// The first chapter's first use is not a link; the second links it first.
		expect(result.output).toContain(
			'- apps/glossary-book/src/content/book/chapters/01-start.mdx:6 "Pager queue" → /read/glossary/pager-queue',
		);
		expect(result.output).not.toContain("02-next.mdx:");
		expect(result.output).toContain(", 1 info");

		const json = JSON.parse(
			run("validate-book.ts", "--book", "glossary-book", "--json").output,
		);
		expect(json.ok).toBe(true);
		expect(
			json.findings.some(
				(finding: { code?: string }) =>
					finding.code === "GLOSSARY_TERM_UNLINKED",
			),
		).toBe(false);
		expect(json.info).toEqual([
			expect.objectContaining({
				level: "info",
				code: "GLOSSARY_TERM_UNLINKED",
				file: "apps/glossary-book/src/content/book/chapters/01-start.mdx",
				line: 6,
				term: "Pager queue",
				href: "/read/glossary/pager-queue",
			}),
		]);
	});

	it("exits 0 with no errors", () => {
		const result = run("validate-book.ts", "--book", "clean-book");
		expect(result.status).toBe(0);
		expect(result.output).toContain("✓ clean-book: no errors");
	});
});

describe("validate-all", () => {
	it("exits 1 and names the book when any book has an error", () => {
		const result = run("validate-all.ts");
		expect(result.status).toBe(1);
		expect(result.output).toContain(
			"✗ 2 of 5 books failed validation: broken-book, mdx-book",
		);
	});
});
