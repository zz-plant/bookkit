import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../_lib";

/**
 * Which books' mechanisms are held to one vocabulary. corpus.json's "books"
 * names the books that opted into a shared corpus: within it a slug names one
 * idea, and two mechanisms that read alike must be merged or ruled distinct.
 * Every other book is its own corpus. Similarity between books in different
 * corpora is worth showing, but it is not a problem in either book.
 */
export type CorpusScope = {
	/** Books in the shared corpus. */
	shared: string[];
	/** Books outside it, each compared with itself only. */
	separate: string[];
	/** "corpus.json" for shared books, the book's own slug otherwise. */
	corpusOf: (book: string) => string;
};

/** corpus.json's "books"; undefined when the file or the list is absent or unreadable. */
export const readCorpusBooks = (
	root: string = repoRoot(),
): string[] | undefined => {
	const path = join(root, "corpus.json");
	if (!existsSync(path)) return undefined;
	try {
		const books = (
			JSON.parse(readFileSync(path, "utf8")) as { books?: unknown }
		).books;
		return Array.isArray(books)
			? books.filter((book): book is string => typeof book === "string")
			: undefined;
	} catch {
		// check:corpus reports an unreadable corpus.json.
		return undefined;
	}
};

/** Without a list of corpus books, every book is in one corpus. */
export const corpusScope = (
	books: readonly string[],
	corpusBooks: readonly string[] | undefined,
): CorpusScope => {
	const sharedSet = new Set(corpusBooks ?? books);
	return {
		shared: books.filter((book) => sharedSet.has(book)),
		separate: books.filter((book) => !sharedSet.has(book)),
		corpusOf: (book) => (sharedSet.has(book) ? "corpus.json" : book),
	};
};
