import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { runTool } from "./index";

/** The repository itself is the workspace: its books and its bet. */
const workspaceRoot = join(import.meta.dir, "../../../../..");
const options = {
	bookTitle: "Running Hot",
	bookSlug: "running-hot",
	workspaceRoot,
	contentRawModules: {
		chapters: {},
		mechanisms: {},
		toolkit: {},
		glossary: {},
		examples: {},
	},
};

describe("bookkit.status and bookkit.bets", () => {
	it("gives every book's counts and the served book's map", async () => {
		const result = await runTool(options, "bookkit.status", {});
		expect(result.ok).toBe(true);
		const payload = result.payload as {
			books: Array<{ book: string }>;
			map: { book: string };
		};
		expect(payload.books.map((book) => book.book)).toContain("running-hot");
		expect(payload.map.book).toBe("running-hot");
	}, 30_000);

	it("names a misspelled book instead of answering about another", async () => {
		const result = await runTool(options, "bookkit.status", {
			book: "running-hto",
		});
		expect(result.ok).toBe(false);
		expect(result.error?.machineCode).toBe("UNKNOWN_BOOK");
	});

	it("reports the active bet", async () => {
		const result = await runTool(options, "bookkit.bets", {});
		expect(result.ok).toBe(true);
		expect(result.summary).toMatch(/^B\d+ · /);
	}, 30_000);
});
