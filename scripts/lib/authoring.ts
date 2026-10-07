import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { extractPageFacts } from "../../packages/astro-bookkit/src/markdown/pageFacts";
import { isThinPage } from "../../packages/astro-bookkit/src/seo/page-meta";
import { listBookDirs, repoRoot, slugify } from "../_lib";
import { loadBookContent } from "./load-book";

/**
 * Helpers behind the author-facing `bookkit` commands: what state each book
 * is in, where a new chapter goes, and which existing mechanisms a new one
 * might duplicate. Read-only; the commands decide what to write.
 */

export type BookConfigSummary = {
	title: string;
	status: string;
	frame?: string;
	site?: { minIndexableWords?: number };
};

export type BookSummary = {
	book: string;
	title: string;
	status: string;
	frame?: string;
	chapters: number;
	stubChapters: string[];
	mechanisms: number;
	tools: number;
	examples: number;
};

const chaptersDir = (book: string) =>
	join(repoRoot(), "apps", book, "src", "content", "book", "chapters");

export const loadBookConfigSummary = async (
	book: string,
): Promise<BookConfigSummary> => {
	const path = join(repoRoot(), "apps", book, "src", "book.config.ts");
	if (!existsSync(path)) return { title: book, status: "unknown" };
	const module = (await import(path)) as {
		bookConfig?: Record<string, unknown>;
		default?: Record<string, unknown>;
	};
	const config = module.bookConfig ?? module.default ?? {};
	const frame = config.frame as { slug?: string } | undefined;
	return {
		title: typeof config.title === "string" ? config.title : book,
		status: typeof config.status === "string" ? config.status : "draft",
		frame: frame?.slug,
		site: config.site as BookConfigSummary["site"],
	};
};

export const summarizeBook = async (book: string): Promise<BookSummary> => {
	const config = await loadBookConfigSummary(book);
	const content = loadBookContent(book);
	const stubChapters = content.chapterBodies
		.filter(({ body }) =>
			isThinPage(extractPageFacts(body).wordCount, config.site),
		)
		.map(({ file }) => file.split("/").pop() ?? file);
	return {
		book,
		title: config.title,
		status: config.status,
		frame: config.frame,
		chapters: content.chapters.length,
		stubChapters,
		mechanisms: content.mechanisms.length,
		tools: content.tools.length,
		examples: content.examples.length,
	};
};

/**
 * The file name for a new chapter: the next number in the book's own scheme
 * (steps of ten when every prefix is a multiple of ten, else one), padded to
 * the existing width, then the slug.
 */
export const nextChapterFileName = (
	existing: string[],
	title: string,
): { fileName: string; slug: string } => {
	const slug = slugify(title);
	const numbers = existing
		.map((name) => name.match(/^(\d+)-/)?.[1])
		.filter((value): value is string => Boolean(value));
	if (numbers.length === 0) return { fileName: `01-${slug}.mdx`, slug };
	const values = numbers.map(Number);
	const width = Math.max(...numbers.map((value) => value.length));
	const step = values.every((value) => value % 10 === 0) ? 10 : 1;
	const next = Math.max(...values) + step;
	return { fileName: `${String(next).padStart(width, "0")}-${slug}.mdx`, slug };
};

export const listChapterFiles = (book: string): string[] =>
	existsSync(chaptersDir(book))
		? readdirSync(chaptersDir(book)).filter((name) => name.endsWith(".mdx"))
		: [];

export const chapterSource = ({
	slug,
	title,
	mechanismSlugs,
}: {
	slug: string;
	title: string;
	mechanismSlugs: string[];
}): string => `---
slug: ${slug}
title: ${JSON.stringify(title)}
status: draft
prerequisites: []
mechanisms: []
---

{/* Bind the mechanisms this chapter uses in \`mechanisms:\` above instead of naming new ones in prose.
This book's mechanisms: ${mechanismSlugs.length > 0 ? mechanismSlugs.join(", ") : "none yet"}.
Add \`summary:\` for search results; until then the first paragraph is used. */}

`;

const STOPWORDS = new Set(
	"a an and are as at be by for from has have in into is it its of on or that the their them they this to was were when where which who with without".split(
		" ",
	),
);

const contentWords = (text: string): Set<string> =>
	new Set(
		text
			.toLowerCase()
			.split(/[^\p{L}\p{N}]+/u)
			.filter((word) => word.length > 2 && !STOPWORDS.has(word))
			.map((word) => word.replace(/(?:ing|ed|es|s)$/u, "")),
	);

export type MechanismMatch = {
	slug: string;
	title: string;
	/** Books that carry it; a shared mechanism is one entry. */
	books: string[];
	/** Share of the new mechanism's words that the existing one also uses. */
	overlap: number;
	sharedWords: string[];
};

/**
 * Existing mechanisms, across every book, that share words with a proposed
 * one. Lexical and cheap: a hint to look before coining a name, not a ruling.
 * `bookkit check` runs the semantic comparison once a definition exists.
 */
export const findSimilarMechanisms = (
	proposal: { title: string; definition?: string },
	books: string[] = listBookDirs(),
	limit = 3,
): MechanismMatch[] => {
	const proposed = contentWords(
		`${proposal.title} ${proposal.definition ?? ""}`,
	);
	if (proposed.size === 0) return [];
	const bySlug = new Map<string, MechanismMatch>();
	for (const book of books) {
		for (const mechanism of loadBookContent(book).mechanisms) {
			const known = bySlug.get(mechanism.slug);
			if (known) {
				known.books.push(book);
				continue;
			}
			const existing = contentWords(
				[
					mechanism.slug.replace(/-/g, " "),
					mechanism.title,
					mechanism.definition,
					...mechanism.is,
				].join(" "),
			);
			const shared = [...proposed].filter((word) => existing.has(word));
			if (shared.length === 0) continue;
			bySlug.set(mechanism.slug, {
				slug: mechanism.slug,
				title: mechanism.title,
				books: [book],
				overlap: shared.length / proposed.size,
				sharedWords: shared,
			});
		}
	}
	return [...bySlug.values()]
		.sort((a, b) => b.overlap - a.overlap)
		.slice(0, limit);
};

/** Books that already carry a mechanism under this slug. */
export const booksWithMechanism = (
	slug: string,
	books: string[] = listBookDirs(),
): Array<{ book: string; file?: string }> =>
	books.flatMap((book) =>
		loadBookContent(book)
			.mechanisms.filter((mechanism) => mechanism.slug === slug)
			.map((mechanism) => ({ book, file: mechanism.file })),
	);

export type Finding = {
	level: "error" | "warning";
	message: string;
	/** Repo-relative path, when the message names a file. */
	file?: string;
};

/** Splits validator messages of the form "<problem>: <absolute path>" into problem and file. */
export const toFindings = (
	level: Finding["level"],
	items: string[],
): Finding[] =>
	items.map((item) => {
		const match = item.match(/^(.*?):\s+(\/\S+\.mdx?)$/);
		return match
			? { level, message: match[1], file: relative(repoRoot(), match[2]) }
			: { level, message: item };
	});

/**
 * Groups validator messages of the form "<problem>: <absolute path>" by file,
 * so five gaps in one tool read as one line. Other messages pass through.
 */
export const groupFindingsByFile = (items: string[]): string[] => {
	const byFile = new Map<string, string[]>();
	const loose: string[] = [];
	for (const item of items) {
		const match = item.match(/^(.*?):\s+(\/\S+\.mdx?)$/);
		if (!match) {
			loose.push(item);
			continue;
		}
		const [, problem, file] = match;
		const list = byFile.get(file) ?? [];
		list.push(problem);
		byFile.set(file, list);
	}
	const grouped = [...byFile.entries()].map(([file, problems]) => {
		const path = relative(repoRoot(), file);
		if (problems.length === 1) return `${path}: ${problems[0]}`;
		const [first, ...rest] = problems;
		const shared = first.match(/^(\S+\s+missing)\s/)?.[1];
		if (shared && rest.every((problem) => problem.startsWith(`${shared} `))) {
			return `${path}: ${shared} ${problems.map((problem) => problem.slice(shared.length + 1)).join(", ")}`;
		}
		return `${path}: ${problems.join("; ")}`;
	});
	return [...loose, ...grouped];
};
