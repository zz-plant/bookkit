import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { extractPageFacts } from "../../packages/astro-bookkit/src/markdown/pageFacts";
import { isThinPage } from "../../packages/astro-bookkit/src/seo/page-meta";
import { corpusEmbeddingText } from "../../packages/astro-bookkit/src/suggestions";
import {
	type BookFinding,
	checkBookContent,
} from "../../packages/astro-bookkit/src/validators/book-validator";
import {
	type ContentCheckResult,
	type ContentSection,
	checkContentItem,
	SECTION_DIRECTORIES,
	scaffoldSource,
} from "../../packages/astro-bookkit/src/validators/content-check";
import { listBookDirs, repoRoot, slugify } from "../_lib";
import { corpusScope, readCorpusBooks } from "./corpus-scope";
import { embedTexts } from "./embed-text";
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
	site?: { url?: string; minIndexableWords?: number };
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
		.map(({ file }) => file.split("/").pop() ?? file)
		// Reading order: the numbered file names sort as the book reads.
		.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
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
}): string =>
	scaffoldSource(
		"chapter",
		{ slug, title, mechanisms: [], prerequisites: [], status: "draft" },
		`Bind the mechanisms this chapter uses in \`mechanisms:\` above instead of naming new ones in prose.
This book's mechanisms: ${mechanismSlugs.length > 0 ? mechanismSlugs.join(", ") : "none yet"}.
Add \`summary:\` for search results; until then the first paragraph is used.`,
	);

const STOPWORDS = new Set(
	"a an and are as at be by for from has have in into is it its of on or that the their them they this to was were when where which who with without".split(
		" ",
	),
);

/** Crude stemming: "waiting", "waited", "waits" → "wait"; "less" stays "less". */
const stem = (word: string): string =>
	word.replace(/(?:ing|ed)$/u, "").replace(/(?<!s)s$/u, "");

const contentWords = (text: string): Set<string> =>
	new Set(
		text
			.toLowerCase()
			.split(/[^\p{L}\p{N}]+/u)
			.filter((word) => word.length > 2 && !STOPWORDS.has(word))
			.map(stem),
	);

export type MechanismMatch = {
	slug: string;
	title: string;
	/** Books that carry it; a shared mechanism is one entry. */
	books: string[];
	/**
	 * Lexical: the share of the proposal's word weight the mechanism also
	 * uses, where words common across mechanisms weigh less. Semantic: cosine
	 * similarity of the two texts' embeddings.
	 */
	score: number;
	/** Words both use (lexical only). */
	sharedWords: string[];
};

type CorpusEntry = {
	slug: string;
	title: string;
	books: string[];
	text: string;
	words: Set<string>;
};

/** One entry per slug across the books, with the text a model or scorer reads. */
const loadCorpusEntries = (books: string[]): CorpusEntry[] => {
	const bySlug = new Map<string, CorpusEntry>();
	for (const book of books) {
		for (const mechanism of loadBookContent(book).mechanisms) {
			const known = bySlug.get(mechanism.slug);
			if (known) {
				known.books.push(book);
				continue;
			}
			const text = corpusEmbeddingText(mechanism);
			bySlug.set(mechanism.slug, {
				slug: mechanism.slug,
				title: mechanism.title,
				books: [book],
				text,
				words: contentWords(`${mechanism.slug.replace(/-/g, " ")} ${text}`),
			});
		}
	}
	return [...bySlug.values()];
};

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Existing mechanisms, across every book, that a proposed one may duplicate.
 * Lexical by default: cheap, and a hint to look before coining a name, not a
 * ruling. Words that most mechanisms use ("people", "institution") count for
 * little. For ideas worded differently, use `findSimilarMechanismsByMeaning`.
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
	const entries = loadCorpusEntries(books);
	const weight = (word: string) => {
		const containing = entries.filter((entry) => entry.words.has(word)).length;
		return Math.log((entries.length + 1) / (containing + 1)) + 1;
	};
	const total = [...proposed].reduce((sum, word) => sum + weight(word), 0);
	return entries
		.map((entry) => {
			const shared = [...proposed].filter((word) => entry.words.has(word));
			const score = shared.reduce((sum, word) => sum + weight(word), 0) / total;
			return {
				slug: entry.slug,
				title: entry.title,
				books: entry.books,
				score: round(score),
				sharedWords: shared,
			};
		})
		.filter((match) => match.sharedWords.length > 0)
		.sort((a, b) => b.score - a.score)
		.slice(0, limit);
};

/**
 * The same question answered by meaning, with check:corpus's embedding model.
 * Returns null when the model cannot load (offline, or not installed), so the
 * caller can fall back to `findSimilarMechanisms`.
 */
export const findSimilarMechanismsByMeaning = async (
	proposal: { title: string; definition?: string },
	books: string[] = listBookDirs(),
	limit = 3,
): Promise<
	{ model: string; matches: MechanismMatch[] } | { error: string }
> => {
	const entries = loadCorpusEntries(books);
	const proposalText = corpusEmbeddingText({
		title: proposal.title,
		definition: proposal.definition ?? "",
		is: [],
	});
	const embedded = await embedTexts([
		proposalText,
		...entries.map((entry) => entry.text),
	]);
	if (!embedded.ok) return { error: embedded.reason };
	const [target, ...vectors] = embedded.vectors;
	const cosine = (a: Float32Array, b: Float32Array) => {
		let dot = 0;
		for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
		return dot;
	};
	return {
		model: embedded.model.id,
		matches: entries
			.map((entry, index) => ({
				slug: entry.slug,
				title: entry.title,
				books: entry.books,
				score: round(cosine(target, vectors[index])),
				sharedWords: [],
			}))
			.sort((a, b) => b.score - a.score)
			.slice(0, limit),
	};
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
	/** Stable identifier for the kind of finding, e.g. FIELD_MISSING. */
	code?: string;
	/** The frontmatter field, for content findings. */
	field?: string;
	/** What to change so the finding goes away. */
	fix?: string;
};

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

/**
 * Checks one content file the way `bun run validate` does: inside its book, so
 * references, duplicate slugs, and the rules the book's status sets all apply.
 * The section comes from its folder and the book from its path, so an agent
 * can check the file it just wrote without reading a whole report.
 */
export const checkContentFile = (
	path: string,
):
	| {
			book: string;
			section: ContentSection;
			/** Absolute path of the file. */
			file: string;
			result: Omit<ContentCheckResult, "findings"> & {
				findings: Array<Omit<BookFinding, "file">>;
			};
	  }
	| {
			error: string;
	  } => {
	const absolute = resolve(path);
	const root = repoRoot();
	const book = relative(root, absolute).match(/^apps\/([^/]+)\//)?.[1];
	// The section is the folder under content/book/; examples nest one deeper.
	const folder = relative(root, absolute).match(
		/^apps\/[^/]+\/src\/content\/book\/([^/]+)\//,
	)?.[1];
	const section = (
		Object.entries(SECTION_DIRECTORIES) as Array<[ContentSection, string]>
	).find(([, directory]) => directory === folder)?.[0];
	if (!existsSync(absolute)) return { error: `No such file: ${path}` };
	if (!book || !section) {
		return {
			error: `Expected apps/<book>/src/content/book/<${Object.values(SECTION_DIRECTORIES).join("|")}>/<file>.mdx, got ${path}`,
		};
	}
	const findings = checkBookContent({ workspaceRoot: root, bookSlug: book })
		.findings.filter((finding) => finding.file === absolute)
		.map(({ file: _file, ...finding }) => finding);
	return {
		book,
		section,
		file: absolute,
		result: {
			...checkContentItem(section, readFileSync(absolute, "utf8")),
			ok: !findings.some((finding) => finding.level === "error"),
			findings,
		},
	};
};

export type SimilarForFile = MechanismMatch & {
	/** The reason, when corpus.json already rules the pair distinct. */
	ruledDistinct?: string;
	/**
	 * Whether the match is in the book's own corpus (see corpus-scope), where
	 * two mechanisms for one idea are a problem. Matches outside it are shown
	 * for information only.
	 */
	sameCorpus: boolean;
};

/** Marks each match as inside or outside `book`'s corpus. */
export const withCorpusScope = <T extends MechanismMatch>(
	matches: T[],
	book: string,
	books: string[] = listBookDirs(),
): Array<T & { sameCorpus: boolean }> => {
	const { corpusOf } = corpusScope(books, readCorpusBooks());
	return matches.map((match) => ({
		...match,
		sameCorpus: match.books.some((other) => corpusOf(other) === corpusOf(book)),
	}));
};

/**
 * Existing mechanisms that a mechanism file in `book` may duplicate, across
 * every book, by wording, each marked as inside or outside the book's corpus.
 * Leaves out the file's own slug (and its copies in other books), and notes
 * pairs corpus.json already rules distinct.
 */
export const similarForMechanismFile = (
	frontmatter: Record<string, unknown> | null,
	book: string,
	minimumScore = 0.3,
): SimilarForFile[] => {
	const title = typeof frontmatter?.title === "string" ? frontmatter.title : "";
	if (!title) return [];
	const slug = typeof frontmatter?.slug === "string" ? frontmatter.slug : "";
	const definition =
		typeof frontmatter?.definition === "string"
			? frontmatter.definition
			: undefined;
	let distinct: Array<{ pair: [string, string]; reason: string }> = [];
	try {
		const corpusPath = join(repoRoot(), "corpus.json");
		distinct = existsSync(corpusPath)
			? (JSON.parse(readFileSync(corpusPath, "utf8")).distinct ?? [])
			: [];
	} catch {
		distinct = [];
	}
	const matches = findSimilarMechanisms(
		{ title, definition },
		listBookDirs(),
		4,
	)
		.filter((match) => match.slug !== slug && match.score >= minimumScore)
		.slice(0, 3)
		.map((match) => ({
			...match,
			ruledDistinct: distinct.find(
				({ pair }) => pair.includes(slug) && pair.includes(match.slug),
			)?.reason,
		}));
	return withCorpusScope(matches, book);
};
