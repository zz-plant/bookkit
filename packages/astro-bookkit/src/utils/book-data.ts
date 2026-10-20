import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

/**
 * Where a book's server keeps what readers send it: page views, preview-link
 * visits, downloads, release clicks and deliveries, and feedback. Each book
 * has a folder of its own, so two books on one machine, or two test runs,
 * never read each other's records.
 *
 * The folder is `.bookkit/` in the book's folder (gitignored, and left alone
 * by `bun install`). `BOOKKIT_DATA_DIR` replaces it; give each book its own.
 */
export const BOOK_DATA_DIR_ENV = "BOOKKIT_DATA_DIR";

/** The files a book's API routes write. */
export type BookDataFile =
	| "reader-analytics.jsonl"
	| "preview-analytics.jsonl"
	| "export-analytics.jsonl"
	| "release-analytics.jsonl"
	| "feedback-events.jsonl";

const workingDirectory = (): string => globalThis.process?.cwd?.() ?? ".";

/**
 * The book's folder: Astro's root, which the bookkit() integration sets, or
 * the working directory where nothing set it (a plain `bun test`).
 */
export const bookRoot = (): string =>
	(typeof import.meta.env === "object" && import.meta.env.BOOKKIT_ROOT) ||
	workingDirectory();

/**
 * `BOOKKIT_DATA_DIR` (relative to the working directory) when set, else
 * `<book>/.bookkit`. Read on every call, so the server's environment decides
 * where records go, not the build's.
 */
export const bookDataDir = (): string => {
	const override = globalThis.process?.env?.[BOOK_DATA_DIR_ENV]?.trim();
	return override
		? resolve(workingDirectory(), override)
		: join(bookRoot(), ".bookkit");
};

export const bookDataPath = (file: BookDataFile): string =>
	join(bookDataDir(), file);

const warned = new Set<string>();

// Cloudflare documents this user agent as the way to tell a Worker.
const onCloudflareWorkers = () =>
	globalThis.navigator?.userAgent === "Cloudflare-Workers";

/**
 * Adds records to a JSON-lines file at `path`, creating the folder first, and
 * says whether they were written. The file is only ever appended to, in one
 * write opened with O_APPEND: two requests at once, or two servers sharing a
 * folder, each add their lines whole, and neither can drop the other's, as
 * reading the file and writing it back could. A failure is logged once per
 * file and cause rather than thrown.
 */
export const appendRecords = async (
	path: string,
	records: readonly unknown[],
): Promise<boolean> => {
	try {
		await mkdir(dirname(path), { recursive: true });
		await appendFile(
			path,
			records.map((record) => `${JSON.stringify(record)}\n`).join(""),
			{ encoding: "utf8", flag: "a" },
		);
		return true;
	} catch (error) {
		const code = (error as { code?: string }).code ?? "error";
		if (warned.has(`${path} ${code}`)) return false;
		warned.add(`${path} ${code}`);
		const reason = error instanceof Error ? error.message : String(error);
		const outcome = onCloudflareWorkers()
			? "Records are dropped: Cloudflare Workers keep no files between requests."
			: `Records are dropped until this server can write there; set ${BOOK_DATA_DIR_ENV} to a folder it can write to.`;
		console.warn(
			`[bookkit] Could not record to ${path}: ${reason}. ${outcome}`,
		);
		return false;
	}
};

/**
 * Adds one record to a book's data file. A reader's request does not fail
 * because the server cannot keep what it sent; see `appendRecords`.
 */
export const appendBookRecord = (
	file: BookDataFile,
	record: unknown,
): Promise<boolean> => appendRecords(bookDataPath(file), [record]);

/**
 * The records in a JSON-lines file at `path`, oldest first; none when the
 * file does not exist yet. A line that is not a JSON object is skipped.
 */
export const readRecords = async <T>(path: string): Promise<T[]> => {
	let text: string;
	try {
		text = await readFile(path, "utf8");
	} catch {
		return [];
	}
	return text.split("\n").flatMap((line) => {
		if (!line.trim()) return [];
		try {
			const record: unknown = JSON.parse(line);
			return record && typeof record === "object" ? [record as T] : [];
		} catch {
			return [];
		}
	});
};

/** The records in one of a book's data files; see `readRecords`. */
export const readBookRecords = <T>(file: BookDataFile): Promise<T[]> =>
	readRecords<T>(bookDataPath(file));
