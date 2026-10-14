import { describe, expect, it } from "bun:test";
import { selectBooks } from "./book-args";

const books = ["handoffs", "on-call", "running-hot"];
const usage = "bun run check:suggestions [book]";

describe("selectBooks", () => {
	it("takes a book as --book <slug>, --book=<slug>, or alone", () => {
		for (const args of [
			["--book", "on-call"],
			["--book=on-call"],
			["on-call"],
			["on-call", "--book", "on-call"],
		]) {
			expect(selectBooks(args, books, { usage })).toEqual({
				ok: true,
				books: ["on-call"],
				named: true,
			});
		}
	});

	it("runs on every book when none is named, unless one is required", () => {
		expect(selectBooks(["--info"], books, { usage })).toEqual({
			ok: true,
			books,
			named: false,
		});
		const required = selectBooks([], books, { usage, requireOne: true });
		expect(required.ok).toBe(false);
		if (!required.ok) {
			expect(required.error).toContain("Name the book to run on.");
			expect(required.error).toContain(
				"Available books: handoffs, on-call, running-hot.",
			);
		}
	});

	it("rejects a --book with no book after it instead of analyzing nothing", () => {
		// `"script": "… --book"` run as `bun run script -- --book on-call`.
		for (const args of [["--book", "--book", "on-call"], ["--book"]]) {
			const selection = selectBooks(args, books, { usage });
			expect(selection.ok).toBe(false);
			if (!selection.ok) {
				expect(selection.error).toStartWith("--book needs a book after it");
				expect(selection.error).toContain(`Usage: ${usage}`);
			}
		}
	});

	it("rejects a book that does not exist, suggesting the closest", () => {
		const selection = selectBooks(["--book", "oncall"], books, { usage });
		expect(selection).toEqual({
			ok: false,
			error: `Book "oncall" not found. Did you mean on-call?\nUsage: ${usage}\nAvailable books: handoffs, on-call, running-hot.`,
		});
	});

	it("does not read a flag's value as a book", () => {
		expect(
			selectBooks(
				["--apply", "mechanisms", "--id", "mechanism:context-debt", "handoffs"],
				books,
				{ usage, valueFlags: ["--apply", "--id"] },
			),
		).toEqual({ ok: true, books: ["handoffs"], named: true });
	});

	it("rejects two different books", () => {
		const selection = selectBooks(["handoffs", "--book", "on-call"], books, {
			usage,
		});
		expect(selection.ok).toBe(false);
		if (!selection.ok) {
			expect(selection.error).toStartWith(
				"Name one book; got handoffs, on-call.",
			);
		}
	});
});
