import { readFileSync } from "node:fs";
import { basename } from "node:path";
import {
	DEFAULT_MIN_INDEXABLE_WORDS,
	shortBookTitle,
} from "../../packages/astro-bookkit/src/seo/page-meta";
import {
	type BookConfigSummary,
	chapterDraft,
	loadBookConfigSummary,
} from "./authoring";
import { corpusScope, readCorpusBooks } from "./corpus-scope";
import { loadBookContent } from "./load-book";

/**
 * Which chapters bind which mechanisms, for one book: `bookkit map`. Bet B1
 * (docs/bets.md) watches whether new chapters bind existing slugs, and a
 * drafted chapter that binds nothing passes that test without saying
 * anything, so the map puts those chapters, and the mechanisms no chapter
 * binds, on one screen. Word counts and the stub threshold come from
 * `chapterDraft`, the numbers `bookkit check <chapter>` and `bookkit bets` use.
 */

export type CoverageChapter = {
	/** The chapter's file name, such as `05-the-transfer-mechanisms.mdx`. */
	file: string;
	/** Its column in the map: the file's number, else its place in the book. */
	label: string;
	words: number;
	stub: boolean;
	/** Mechanisms of this book it lists in `mechanisms:`. */
	binds: string[];
	/** Slugs it lists that the book does not define. */
	unknown: string[];
};

export type CoverageMechanism = {
	slug: string;
	title: string;
	/** File names of the chapters that bind it, in reading order. */
	chapters: string[];
	/** Other books of its corpus that define the same slug. */
	sharedWith: string[];
};

export type CoverageMap = {
	book: string;
	title: string;
	/** `site.minIndexableWords`; 0 when the book turns stubs off. */
	minimum: number;
	chapters: CoverageChapter[];
	mechanisms: CoverageMechanism[];
};

export type CoverageInput = {
	book: string;
	title: string;
	site?: BookConfigSummary["site"];
	chapters: Array<{ file: string; source: string; mechanisms: string[] }>;
	mechanisms: Array<{ slug: string; title: string }>;
	/** The other books in this book's corpus, with their mechanism slugs. */
	corpusBooks: Array<{ book: string; mechanisms: string[] }>;
};

export const buildCoverageMap = (input: CoverageInput): CoverageMap => {
	const slugs = input.mechanisms.map((mechanism) => mechanism.slug);
	const chapters = input.chapters
		.map((chapter) => ({ ...chapter, file: basename(chapter.file) }))
		// Reading order: the numbered file names sort as the book reads.
		.sort((a, b) => a.file.localeCompare(b.file, undefined, { numeric: true }))
		.map((chapter, index): CoverageChapter => {
			const draft = chapterDraft(
				chapter.source,
				chapter.mechanisms,
				slugs,
				input.site,
			);
			return {
				file: chapter.file,
				label: chapter.file.match(/^(\d+)/)?.[1] ?? String(index + 1),
				words: draft.words,
				stub: draft.stub,
				binds: draft.binds,
				unknown: draft.unknown,
			};
		});
	return {
		book: input.book,
		title: input.title,
		minimum: input.site?.minIndexableWords ?? DEFAULT_MIN_INDEXABLE_WORDS,
		chapters,
		mechanisms: [...input.mechanisms]
			.sort((a, b) => a.slug.localeCompare(b.slug))
			.map((mechanism) => ({
				slug: mechanism.slug,
				title: mechanism.title,
				chapters: chapters
					.filter((chapter) => chapter.binds.includes(mechanism.slug))
					.map((chapter) => chapter.file),
				sharedWith: input.corpusBooks
					.filter((other) => other.mechanisms.includes(mechanism.slug))
					.map((other) => other.book),
			})),
	};
};

/** One book's map, read from its content and from corpus.json's books. */
export const loadCoverageMap = async (
	book: string,
	books: string[],
): Promise<CoverageMap> => {
	const config = await loadBookConfigSummary(book);
	const content = loadBookContent(book);
	const scope = corpusScope(books, readCorpusBooks());
	// A slug names one idea only within a corpus; a book outside the shared
	// one is its own corpus and shares with no other book.
	const corpusPeers = scope.shared.includes(book)
		? scope.shared.filter((other) => other !== book)
		: [];
	return buildCoverageMap({
		book,
		title: config.title,
		site: config.site,
		chapters: content.chapters.map((chapter) => ({
			file: chapter.file ?? chapter.slug,
			source: chapter.file ? readFileSync(chapter.file, "utf8") : "",
			mechanisms: chapter.mechanisms,
		})),
		mechanisms: content.mechanisms.map(({ slug, title }) => ({ slug, title })),
		corpusBooks: corpusPeers.map((other) => ({
			book: other,
			mechanisms: loadBookContent(other).mechanisms.map((m) => m.slug),
		})),
	});
};

const plural = (count: number, noun: string) =>
	`${count} ${noun}${count === 1 ? "" : "s"}`;

const chapterName = (file: string) => file.replace(/\.mdx?$/, "");

/** The map as terminal lines: a grid of mechanisms by chapter, then what needs binding. */
export const formatCoverageMap = (map: CoverageMap): string[] => {
	const stubs = map.chapters.filter((chapter) => chapter.stub);
	const lines = [
		`${map.book} · ${shortBookTitle(map.title)}`,
		`${plural(map.chapters.length, "chapter")}${stubs.length > 0 ? ` (${plural(stubs.length, "stub")})` : ""} · ${plural(map.mechanisms.length, "mechanism")}`,
	];
	if (map.chapters.length === 0) {
		lines.push(
			"",
			`No chapters yet: bun run bookkit new chapter ${map.book} "<title>".`,
		);
		return lines;
	}

	const stubRow =
		map.minimum > 0 ? `stub (under ${map.minimum} words)` : undefined;
	const rowWidth = Math.max(
		...map.mechanisms.map((mechanism) => mechanism.slug.length),
		stubRow?.length ?? 0,
	);
	const columnWidth = Math.max(
		...map.chapters.map((chapter) => chapter.label.length),
	);
	const cells = (mark: (chapter: CoverageChapter) => string) =>
		map.chapters
			.map((chapter) => mark(chapter).padStart(columnWidth))
			.join(" ");
	if (map.mechanisms.length > 0) {
		lines.push(
			"",
			`  ${" ".repeat(rowWidth)}  ${cells((chapter) => chapter.label)}`,
		);
		for (const mechanism of map.mechanisms) {
			lines.push(
				`  ${mechanism.slug.padEnd(rowWidth)}  ${cells((chapter) => (chapter.binds.includes(mechanism.slug) ? "●" : "·"))}  ${mechanism.chapters.length}`,
			);
		}
		if (stubRow && stubs.length > 0) {
			lines.push(
				`  ${stubRow.padEnd(rowWidth)}  ${cells((chapter) => (chapter.stub ? "s" : " "))}`,
			);
		}
		lines.push("", "  ● the chapter lists the mechanism in mechanisms:");
	} else {
		lines.push(
			"",
			`No mechanisms yet: bun run bookkit new mechanism ${map.book} "<title>".`,
		);
	}

	if (map.mechanisms.length > 0) lines.push("");
	const unbound = map.chapters.filter((chapter) => chapter.binds.length === 0);
	if (unbound.length > 0 && map.mechanisms.length > 0) {
		const nameWidth = Math.max(
			...unbound.map((chapter) => chapterName(chapter.file).length),
		);
		const wordWidth = Math.max(
			...unbound.map((chapter) => String(chapter.words).length),
		);
		lines.push(
			`  Chapters that bind no mechanism (${unbound.length} of ${map.chapters.length}):`,
		);
		for (const chapter of unbound) {
			lines.push(
				`    ${chapterName(chapter.file).padEnd(nameWidth)}  ${String(chapter.words).padStart(wordWidth)} words${chapter.stub ? ", a stub" : ""}`,
			);
		}
	}
	const unused = map.mechanisms.filter(
		(mechanism) => mechanism.chapters.length === 0,
	);
	if (map.mechanisms.length > 0) {
		lines.push(
			`  Mechanisms no chapter binds: ${unused.length > 0 ? unused.map((mechanism) => mechanism.slug).join(", ") : "none"}.`,
		);
	}
	const shared = map.mechanisms.filter(
		(mechanism) => mechanism.sharedWith.length > 0,
	);
	if (shared.length > 0) {
		lines.push(
			`  Shared with other books of the corpus: ${shared.map((mechanism) => `${mechanism.slug} (${mechanism.sharedWith.join(", ")})`).join(", ")}.`,
		);
	}
	const unknown = new Map<string, string[]>();
	for (const chapter of map.chapters) {
		for (const slug of chapter.unknown) {
			unknown.set(slug, [...(unknown.get(slug) ?? []), chapter.label]);
		}
	}
	if (unknown.size > 0) {
		lines.push(
			`  Listed in mechanisms: but not a mechanism of this book: ${[...unknown].map(([slug, labels]) => `${slug} (${labels.join(", ")})`).join(", ")}. bun run bookkit check ${map.book} reports each as an error.`,
		);
	}
	if (unbound.length > 0 && map.mechanisms.length > 0) {
		lines.push(
			"",
			"  Bind a mechanism by adding its slug to the chapter's mechanisms: list.",
			"  bun run bookkit check <chapter file> lists the book's mechanisms beside the chapter's own.",
		);
	}
	return lines.map((line) => line.trimEnd());
};
