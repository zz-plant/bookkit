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
	| "feedback-events.json";

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
 * Adds one record to a JSON-lines file, creating the folder first. A failure
 * is logged once per file and cause rather than thrown: a reader's request
 * does not fail because the server cannot keep what it sent.
 */
export const appendBookRecord = async (
	file: BookDataFile,
	record: unknown,
): Promise<void> => {
	const path = bookDataPath(file);
	try {
		await mkdir(dirname(path), { recursive: true });
		await appendFile(path, `${JSON.stringify(record)}\n`, "utf8");
	} catch (error) {
		const code = (error as { code?: string }).code ?? "error";
		if (warned.has(`${path} ${code}`)) return;
		warned.add(`${path} ${code}`);
		const reason = error instanceof Error ? error.message : String(error);
		const outcome = onCloudflareWorkers()
			? "Records are dropped: Cloudflare Workers keep no files between requests."
			: `Records are dropped until this server can write there; set ${BOOK_DATA_DIR_ENV} to a folder it can write to.`;
		console.warn(
			`[bookkit] Could not record to ${path}: ${reason}. ${outcome}`,
		);
	}
};

/**
 * The records in a JSON-lines file, oldest first; none when the file does not
 * exist yet. A line that is not a JSON object is skipped.
 */
export const readBookRecords = async <T>(file: BookDataFile): Promise<T[]> => {
	let text: string;
	try {
		text = await readFile(bookDataPath(file), "utf8");
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
