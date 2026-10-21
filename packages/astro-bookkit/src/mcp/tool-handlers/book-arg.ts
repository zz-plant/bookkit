import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { BookContentRawModules } from "../../book/entrypoints";
import {
	CONTENT_SECTIONS,
	type ContentSection,
	SECTION_DIRECTORIES,
} from "../../validators/content-check";
import type {
	ContentTypeKey,
	McpEndpointOptions,
	ToolResponse,
} from "../types";
import { CONTENT_TYPES } from "../types";

/**
 * The `book` argument the tools share: the served book when none is given,
 * and an error naming the workspace's books when the one given is not there,
 * instead of answering about another book or an empty one.
 */

/** Book apps in the workspace: apps/<slug>/ folders that hold a content tree. */
export const workspaceBooks = (workspaceRoot: string | undefined): string[] => {
	if (!workspaceRoot) return [];
	const apps = join(workspaceRoot, "apps");
	return existsSync(apps)
		? readdirSync(apps, { withFileTypes: true })
				.filter(
					(entry) =>
						entry.isDirectory() &&
						existsSync(join(apps, entry.name, "src", "content", "book")),
				)
				.map((entry) => entry.name)
				.sort()
		: [];
};

export type BookArg =
	| { ok: true; book: string | undefined }
	| { ok: false; response: ToolResponse };

/** The book a call is about: `args.book`, checked, else the served book. */
export const bookArg = (
	options: McpEndpointOptions,
	args: Record<string, unknown> | undefined,
): BookArg => {
	const raw = args?.book;
	const named = typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
	if (!named) return { ok: true, book: options.bookSlug };
	if (named === options.bookSlug) return { ok: true, book: named };
	const books = workspaceBooks(options.workspaceRoot);
	if (books.includes(named)) return { ok: true, book: named };
	return {
		ok: false,
		response: {
			ok: false,
			summary: `No book "${named}" in this workspace.`,
			error: {
				cause: books.length
					? `Books: ${books.join(", ")}.`
					: "This server has no workspace to look for other books in.",
				machineCode: "UNKNOWN_BOOK",
				nextAction: books.length
					? "Call again with one of those slugs (bookkit.list_books lists them)."
					: "Omit book to use the served book.",
			},
		},
	};
};

const listContent = (dir: string): string[] =>
	existsSync(dir)
		? readdirSync(dir, { recursive: true })
				.map(String)
				.filter((file) => /\.mdx?$/.test(file))
		: [];

/**
 * A book's raw content: the served book's from the server, another
 * workspace book's from disk, keyed as the apps' `import.meta.glob` keys them.
 */
export const contentOf = (
	options: McpEndpointOptions,
	book: string | undefined,
): BookContentRawModules => {
	if (!book || book === options.bookSlug || !options.workspaceRoot) {
		return options.contentRawModules;
	}
	const root = join(
		options.workspaceRoot,
		"apps",
		book,
		"src",
		"content",
		"book",
	);
	return Object.fromEntries(
		CONTENT_TYPES.map((section) => [
			section,
			Object.fromEntries(
				listContent(join(root, section)).map((file) => [
					`../content/book/${section}/${file.split("\\").join("/")}`,
					readFileSync(join(root, section, file), "utf8"),
				]),
			),
		]),
	) as BookContentRawModules;
};

/** The title to name a book by: the served book's, else its slug. */
export const titleOf = (
	options: McpEndpointOptions,
	book: string | undefined,
): string => (!book || book === options.bookSlug ? options.bookTitle : book);

/**
 * Section names as the tools take them: the singular (chapter, as
 * check_content and get_content_contract name it), the folder (chapters, as
 * read_book does), or "tools". Each tool accepts every form.
 */
export const SECTION_NAMES: readonly string[] = [
	...CONTENT_SECTIONS,
	...CONTENT_TYPES,
	"tools",
];

/** A section name in any form, as the singular check_content takes. */
export const toSection = (value: unknown): ContentSection | undefined => {
	if (typeof value !== "string") return undefined;
	const name = value.trim().toLowerCase();
	if (name === "tools") return "tool";
	return CONTENT_SECTIONS.find(
		(section) => section === name || SECTION_DIRECTORIES[section] === name,
	);
};

/** A section name in any form, as the content folder read_book takes. */
export const toContentType = (value: unknown): ContentTypeKey | undefined => {
	const section = toSection(value);
	return section ? (SECTION_DIRECTORIES[section] as ContentTypeKey) : undefined;
};
