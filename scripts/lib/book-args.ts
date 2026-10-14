import { didYouMean } from "./cli";

/**
 * The books a governance script runs on, from its arguments. A book can be
 * named as `--book <slug>`, `--book=<slug>`, or alone (`bun run propose
 * on-call`), so `bun run <script> -- --book <slug>` and `bun run <script>
 * <slug>` both work. With no book the script runs on every book, or stops
 * with its usage when it needs one. A name that is not a book stops the
 * script instead of analyzing nothing.
 */
export type BookSelection =
	| { ok: true; books: string[]; named: boolean }
	| { ok: false; error: string };

export type BookSelectionOptions = {
	/** One line, e.g. "bun run propose <book> [--write]". */
	usage: string;
	/** Flags that take a value, so the value is not read as a book. */
	valueFlags?: readonly string[];
	/** Stop when no book is named, instead of running on every book. */
	requireOne?: boolean;
};

export const selectBooks = (
	args: readonly string[],
	available: readonly string[],
	options: BookSelectionOptions,
): BookSelection => {
	const valueFlags = new Set(options.valueFlags ?? []);
	const listing = available.length
		? `Available books: ${available.join(", ")}.`
		: "No books found under apps/.";
	const fail = (error: string): BookSelection => ({
		ok: false,
		error: `${error}\nUsage: ${options.usage}\n${listing}`,
	});

	const named: string[] = [];
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--book") {
			const value = args[index + 1];
			if (!value || value.startsWith("-")) {
				return fail(
					`--book needs a book after it${value ? `, got "${value}"` : ""}.`,
				);
			}
			named.push(value);
			index += 1;
		} else if (arg.startsWith("--book=")) {
			const value = arg.slice("--book=".length);
			if (!value) return fail("--book= needs a book after it.");
			named.push(value);
		} else if (arg.startsWith("-")) {
			if (valueFlags.has(arg)) index += 1;
		} else {
			named.push(arg);
		}
	}

	const unique = [...new Set(named)];
	if (unique.length > 1) {
		return fail(`Name one book; got ${unique.join(", ")}.`);
	}
	const [book] = unique;
	if (book) {
		if (!available.includes(book)) {
			return fail(`Book "${book}" not found.${didYouMean(book, available)}`);
		}
		return { ok: true, books: [book], named: true };
	}
	if (available.length === 0) return fail("No books found under apps/.");
	if (options.requireOne) return fail("Name the book to run on.");
	return { ok: true, books: [...available], named: false };
};

/** `selectBooks` for a script's own argv; prints the error and exits 1 on failure. */
export const booksFromArgv = (
	available: readonly string[],
	options: BookSelectionOptions,
): { books: string[]; named: boolean } => {
	const selection = selectBooks(process.argv.slice(2), available, options);
	if (!selection.ok) {
		console.error(selection.error);
		process.exit(1);
	}
	return selection;
};
