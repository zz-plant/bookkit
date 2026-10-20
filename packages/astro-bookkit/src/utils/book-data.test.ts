import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	runChildAsync,
	waitForChildren,
} from "../../../../scripts/lib/child-process.fixture";
import {
	appendBookRecord,
	appendRecords,
	BOOK_DATA_DIR_ENV,
	bookDataDir,
	bookDataPath,
	readBookRecords,
	readRecords,
} from "./book-data";

// Under Bun, import.meta.env is process.env, so BOOKKIT_ROOT here stands in
// for the book's folder that the bookkit() integration sets in a dev server
// or build.
const ENV = [BOOK_DATA_DIR_ENV, "BOOKKIT_ROOT"] as const;

// One test starts four bun processes at once.
waitForChildren();

let saved: Record<string, string | undefined>;
let scratch: string;

beforeEach(() => {
	saved = Object.fromEntries(ENV.map((key) => [key, process.env[key]]));
	for (const key of ENV) delete process.env[key];
	scratch = mkdtempSync(join(tmpdir(), "bookkit-book-data-"));
});
afterEach(() => {
	for (const key of ENV) {
		if (saved[key] === undefined) delete process.env[key];
		else process.env[key] = saved[key];
	}
	rmSync(scratch, { recursive: true, force: true });
});

describe("bookDataDir", () => {
	it("is .bookkit/ in the book's folder", () => {
		process.env.BOOKKIT_ROOT = join(scratch, "apps", "on-call");
		expect(bookDataDir()).toBe(join(scratch, "apps", "on-call", ".bookkit"));
		expect(bookDataPath("reader-analytics.jsonl")).toBe(
			join(scratch, "apps", "on-call", ".bookkit", "reader-analytics.jsonl"),
		);
	});

	it("is .bookkit/ in the working directory when nothing names the book's folder", () => {
		expect(bookDataDir()).toBe(join(process.cwd(), ".bookkit"));
	});

	it("is BOOKKIT_DATA_DIR when set, resolved against the working directory", () => {
		process.env.BOOKKIT_ROOT = join(scratch, "apps", "on-call");
		process.env[BOOK_DATA_DIR_ENV] = join(scratch, "data");
		expect(bookDataDir()).toBe(join(scratch, "data"));

		process.env[BOOK_DATA_DIR_ENV] = "var/on-call";
		expect(bookDataDir()).toBe(join(process.cwd(), "var", "on-call"));

		process.env[BOOK_DATA_DIR_ENV] = "  ";
		expect(bookDataDir()).toBe(join(scratch, "apps", "on-call", ".bookkit"));
	});
});

describe("appendBookRecord and readBookRecords", () => {
	it("create the folder, append one JSON line per record, and read them back in order", async () => {
		process.env.BOOKKIT_ROOT = join(scratch, "book");
		await appendBookRecord("reader-analytics.jsonl", { n: 1 });
		await appendBookRecord("reader-analytics.jsonl", { n: 2 });

		const file = join(scratch, "book", ".bookkit", "reader-analytics.jsonl");
		expect(readFileSync(file, "utf8")).toBe('{"n":1}\n{"n":2}\n');
		expect(await readBookRecords("reader-analytics.jsonl")).toEqual([
			{ n: 1 },
			{ n: 2 },
		]);
	});

	it("read nothing from a file that does not exist, and skip lines that are not JSON objects", async () => {
		process.env[BOOK_DATA_DIR_ENV] = scratch;
		expect(await readBookRecords("preview-analytics.jsonl")).toEqual([]);

		writeFileSync(
			join(scratch, "preview-analytics.jsonl"),
			'{"a":1}\nnot json\nnull\n\n{"b":2}\n',
		);
		expect(await readBookRecords("preview-analytics.jsonl")).toEqual([
			{ a: 1 },
			{ b: 2 },
		]);
	});

	it("keep every record when several servers append to one file at once", async () => {
		const file = join(scratch, "shared.jsonl");
		// Each process appends 100 times, three records at a time, as a
		// server does for one request's events.
		const writer = (name: string) =>
			runChildAsync([
				process.execPath,
				"-e",
				`const { appendRecords } = await import(${JSON.stringify(join(import.meta.dir, "book-data.ts"))});
				await Promise.all(Array.from({ length: 100 }, (_, i) =>
					appendRecords(${JSON.stringify(file)}, [0, 1, 2].map((part) => ({ writer: "${name}", i, part }))),
				));`,
			]);
		const writers = await Promise.all(["a", "b", "c", "d"].map(writer));
		expect(writers.map(({ status, output }) => ({ status, output }))).toEqual(
			writers.map(() => ({ status: 0, output: "" })),
		);
		await appendRecords(file, [{ writer: "test", i: 0, part: 0 }]);

		const records = await readRecords<{
			writer: string;
			i: number;
			part: number;
		}>(file);
		expect(records).toHaveLength(4 * 100 * 3 + 1);
		// One call's records stay together, in order.
		records.forEach((record, index) => {
			if (record.part > 0) {
				expect(records[index - 1]).toEqual({
					...record,
					part: record.part - 1,
				});
			}
		});
	});

	it("keep the request going when the folder cannot be written, and say so once", async () => {
		const warned = spyOn(console, "warn").mockImplementation(() => {});
		try {
			// A folder inside a file cannot be created.
			writeFileSync(join(scratch, "a-file"), "");
			process.env[BOOK_DATA_DIR_ENV] = join(scratch, "a-file", "data");

			expect(await appendBookRecord("export-analytics.jsonl", { n: 1 })).toBe(
				false,
			);
			await appendBookRecord("export-analytics.jsonl", { n: 2 });

			expect(warned).toHaveBeenCalledTimes(1);
			const message = String(warned.mock.calls[0]?.[0]);
			expect(message).toContain(
				join(scratch, "a-file", "data", "export-analytics.jsonl"),
			);
			expect(message).toContain(BOOK_DATA_DIR_ENV);
			expect(existsSync(join(scratch, "a-file", "data"))).toBe(false);
		} finally {
			warned.mockRestore();
		}
	});
});
