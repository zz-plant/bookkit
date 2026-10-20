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

/**
 * validate-book and validate-all against a scratch workspace: a book with five
 * errors in three files, and a clean one.
 */

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

const run = (script: string, ...args: string[]) => {
	const result = Bun.spawnSync(
		[process.execPath, join(workspace, "scripts", script), ...args],
		{ cwd: workspace, stdout: "pipe", stderr: "pipe" },
	);
	return {
		status: result.exitCode,
		output: `${result.stdout.toString()}${result.stderr.toString()}`,
	};
};

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
			"apps/placeholder-book/src/book.config.ts still has the starter text for site.url",
		);
		expect(result.output).toContain(
			"still has the starter text for causalStance, which shows on the overview page",
		);
		expect(result.output).toContain(
			"fix: Replace it with the book's core claim about what causes the problem it covers.",
		);
		expect(result.output).not.toContain("objectives.readerStart");
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
			"✗ 2 of 4 books failed validation: broken-book, mdx-book",
		);
	});
});
