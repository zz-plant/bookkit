/**
 * A book as its rules read it: the finding every book rule returns, each
 * section's files, the status and frame book.config.ts sets, the slugs the
 * read routes serve, and the slugs a merge retired.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { isReleasedStatus } from "../../schemas/status";
import { parseFrontmatter } from "../../utils/frontmatter";
import {
	CONTENT_SECTIONS,
	type ContentCheckContext,
	type ContentFinding,
	type ContentSection,
	mechanismSlugsFrom,
	type RetiredSlug,
	retiredSlugsFromCorpus,
	SECTION_DIRECTORIES,
} from "../content-check";
import {
	extractBookStatusFromSource,
	extractFrameConfigFromSource,
} from "../frame-config";

export type BookFinding = Omit<ContentFinding, "code"> & {
	/**
	 * Content codes, plus DIRECTORY_MISSING, FRAME_STEP_MISSING, FRAME_UNKNOWN,
	 * FRAME_STEP_UNKNOWN, FRAME_STEP_REQUIRED, DUPLICATE_SLUG,
	 * BOOK_STATUS_INVALID, BOOK_EMPTY, IMAGE_MISSING, MECHANISM_NO_ACTION,
	 * MECHANISM_NO_EXAMPLE, RELEASE_NOTE_*, CONFIG_PLACEHOLDER,
	 * RELEASE_NOT_INDEXABLE, and RELEASE_SITE_URL.
	 */
	code: string;
	/** Absolute path, when the finding is about one file. */
	file?: string;
};

export const bookContentDir = (workspaceRoot: string, book: string): string =>
	join(workspaceRoot, "apps", book, "src", "content", "book");

/**
 * Content files under a folder, in path order: the order the build's
 * import.meta.glob index sorts them, so the first of two files sharing a slug
 * is the one the site serves.
 */
export const listFiles = (dir: string): string[] => {
	if (!existsSync(dir)) return [];
	const files: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) files.push(...listFiles(full));
		else if (entry.isFile() && /\.mdx?$/.test(entry.name)) files.push(full);
	}
	return files.sort((a, b) => a.localeCompare(b));
};

/** Each section's files and their sources. */
export const readBookSources = (
	workspaceRoot: string,
	book: string,
): Record<ContentSection, Array<{ file: string; source: string }>> => {
	const root = bookContentDir(workspaceRoot, book);
	return Object.fromEntries(
		CONTENT_SECTIONS.map((section) => [
			section,
			listFiles(join(root, SECTION_DIRECTORIES[section])).map((file) => ({
				file,
				source: readFileSync(file, "utf8"),
			})),
		]),
	) as Record<ContentSection, Array<{ file: string; source: string }>>;
};

export const bookConfigPath = (workspaceRoot: string, book: string) =>
	join(workspaceRoot, "apps", book, "src", "book.config.ts");

/** The `status` written in apps/<book>/src/book.config.ts, if any. */
export const readBookStatus = (
	workspaceRoot: string,
	book: string,
): string | undefined => {
	const path = bookConfigPath(workspaceRoot, book);
	return existsSync(path)
		? extractBookStatusFromSource(readFileSync(path, "utf8"))
		: undefined;
};

/** The frame slug set in apps/<book>/src/book.config.ts, if any. */
export const readBookFrame = (
	workspaceRoot: string,
	book: string,
): string | undefined => {
	const path = bookConfigPath(workspaceRoot, book);
	return existsSync(path)
		? extractFrameConfigFromSource(readFileSync(path, "utf8"))?.slug
		: undefined;
};

/** Every slug the book's read routes serve, per section. */
export const routeSlugsOf = (
	sources: Record<ContentSection, Array<{ file: string; source: string }>>,
): Record<ContentSection, Set<string>> =>
	Object.fromEntries(
		CONTENT_SECTIONS.map((section) => [
			section,
			new Set(
				sources[section].flatMap(({ file, source }) => {
					const frontmatter = parseFrontmatter(source);
					return frontmatter.status === "ok"
						? [routeSlug(file, frontmatter.data)]
						: [];
				}),
			),
		]),
	) as Record<ContentSection, Set<string>>;

/** Merges recorded in the workspace's corpus.json; empty when it is absent or unreadable. */
export const readRetiredSlugs = (
	workspaceRoot: string,
): Map<string, RetiredSlug> => {
	const path = join(workspaceRoot, "corpus.json");
	if (!existsSync(path)) return new Map();
	try {
		return retiredSlugsFromCorpus(JSON.parse(readFileSync(path, "utf8")));
	} catch {
		// check:corpus reports an unreadable corpus.json.
		return new Map();
	}
};

/** The slug a record's page is served at: its `slug`, else its file name. */
export const routeSlug = (
	file: string,
	data: Record<string, unknown>,
): string =>
	typeof data.slug === "string" || typeof data.slug === "number"
		? String(data.slug)
		: basename(file).replace(/\.mdx?$/, "");

export type ParsedSource = {
	file: string;
	source: string;
	data: Record<string, unknown> | null;
};

export type BookCheckContext = Omit<
	ContentCheckContext,
	"format" | "mechanismSlugs" | "slugs" | "releaseMode"
> & {
	mechanismSlugs: Set<string>;
	slugs: Record<ContentSection, Set<string>>;
	releaseMode: boolean;
};

export type BookSources = Record<
	ContentSection,
	Array<{ file: string; source: string }>
>;

/**
 * What a file of a book is checked with besides its own text: the book's
 * mechanisms and route slugs, the slugs a merge retired, its frame, and
 * whether release rules apply. `validate` checks each of the book's files
 * with it, and `bookkit check <file>`, a draft's gate, `bookkit define`, and
 * MCP `check_content` check a file not yet written with it, so a candidate
 * meets the rules the book's own files do. Without a workspace (a served
 * book's MCP), only what the sources say is known.
 */
export const bookCheckContext = (input: {
	sources: BookSources;
	workspaceRoot?: string;
	book?: string;
	/** true forces release rules; otherwise the book's status decides. */
	releaseMode?: boolean;
}): { context: BookCheckContext; status?: string } => {
	const { sources, workspaceRoot, book } = input;
	const status =
		workspaceRoot && book ? readBookStatus(workspaceRoot, book) : undefined;
	return {
		status,
		context: {
			mechanismSlugs: mechanismSlugsFrom(
				sources.mechanism.map(({ source }) => source),
			),
			slugs: routeSlugsOf(sources),
			retiredSlugs: workspaceRoot ? readRetiredSlugs(workspaceRoot) : undefined,
			releaseMode: input.releaseMode === true || isReleasedStatus(status),
			frame:
				workspaceRoot && book ? readBookFrame(workspaceRoot, book) : undefined,
		},
	};
};

/** The context a new or changed file of a workspace book is checked with, read from disk. */
export const candidateCheckContext = (
	workspaceRoot: string,
	book: string,
	releaseMode?: boolean,
) =>
	bookCheckContext({
		sources: readBookSources(workspaceRoot, book),
		workspaceRoot,
		book,
		releaseMode,
	});
