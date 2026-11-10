import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	renameSync,
	rmdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { listBookDirs, repoRoot } from "../../_lib";
import { choose, didYouMean, readFocusBook } from "../cli";
import type { FileChange } from "../merge-mechanisms";

/**
 * What the `bookkit` commands share: the arguments, the books and the
 * current one, and the helpers that resolve a book, run one of scripts/, and
 * write a plan's file changes. scripts/bookkit.ts dispatches; each command
 * group in this folder imports what it needs from here, and nothing here
 * imports a command group.
 */

export const args = process.argv.slice(2);
// No command: the books, and the commands to write, check, preview, build, and deploy one.
export const command = args[0] ?? "status";

/** The books in apps/, once `loadBooks` has run. */
export let books: string[] = [];

/** The book set with `bookkit use`; commands that take a book default to it. */
export let focusBook: string | undefined;

/**
 * Reads the books and the current one, once. scripts/bookkit.ts calls it
 * after `--help` is answered, so help reads nothing; every import of
 * `books` and `focusBook` sees the values from then on.
 */
export function loadBooks(): void {
	books = listBookDirs();
	focusBook = readFocusBook(books);
}

export const bookChoices = () =>
	books.map((book) => ({
		value: book,
		label: book === focusBook ? "(current)" : undefined,
	}));

/**
 * The book a command acts on: the one named, else the current book (`bookkit
 * use`), else the only book, else one picked at a prompt. Exits with a
 * suggestion for a misspelled name, or with the usage when nothing can be
 * resolved.
 */
export const requireBook = (
	book: string | undefined,
	usage: string,
): string => {
	if (book && books.includes(book)) return book;
	if (book) {
		console.error(
			`Book "${book}" not found.${didYouMean(book, books)} Available books: ${books.join(", ")}`,
		);
		process.exit(1);
	}
	const picked =
		focusBook ??
		(books.length === 1 ? books[0] : choose("Which book?", bookChoices()));
	if (picked) return picked;
	console.error(
		`Usage: ${usage}\nAvailable books: ${books.join(", ")}. Or set one with bun run bookkit use <book>, and leave it out.`,
	);
	process.exit(1);
};

/**
 * Splits a command's positional arguments into the book and the rest. The book
 * may be left out (the current book is used) when only the command's own
 * arguments are given, even one that is also a book's name (`new chapter
 * on-call` titles a chapter "on-call"); with one argument too many, the first
 * must be a book, and with too few, a book's name is the book.
 */
export const takeBook = (
	positional: string[],
	ownArguments: number,
	usage: string,
): [string, string[]] => {
	if (positional.length > ownArguments) {
		return [requireBook(positional[0], usage), positional.slice(1)];
	}
	if (
		positional.length < ownArguments &&
		positional[0] &&
		books.includes(positional[0])
	) {
		return [positional[0], positional.slice(1)];
	}
	return [requireBook(undefined, usage), positional];
};

/**
 * A child process's exit code, or 1 when it has none: a command that never
 * started (not on PATH) or was killed by a signal must not read as success.
 */
export function exitCodeOf(
	result: SpawnSyncReturns<unknown>,
	what: string,
): number {
	if (result.error) {
		console.error(`Could not run ${what}: ${result.error.message}`);
		return 1;
	}
	if (result.signal) {
		console.error(`${what} was stopped by ${result.signal}.`);
		return 1;
	}
	return result.status ?? 1;
}

/** Runs one of scripts/ with this process's own bun, so PATH does not matter. */
export function runScript(script: string, scriptArgs: string[]): number {
	return exitCodeOf(
		spawnSync(
			process.execPath,
			["run", join(repoRoot(), "scripts", script), ...scriptArgs],
			{ stdio: "inherit" },
		),
		`scripts/${script}`,
	);
}

/**
 * The books build and deploy act on: the one named, else the current book
 * (`bookkit use`), else every book. `--all` always means every book, which is
 * what CI and `bun run deploy` ask for.
 */
export function targetBooks(
	list: string[],
	usage: string,
): { books: string[]; note?: string } {
	const named = list[1] && !list[1].startsWith("--") ? list[1] : undefined;
	if (named) return { books: [requireBook(named, usage)] };
	if (focusBook && !list.includes("--all")) {
		return {
			books: [focusBook],
			note: `(${focusBook} is the current book; add --all for every book.)`,
		};
	}
	return { books };
}

/**
 * Scripts that take `--book <slug>` also accept the book first (`propose
 * running-hot`), or default to the current book (`bookkit use`), else the only
 * book.
 */
export function withBookFlag(rest: string[]): string[] {
	if (rest.includes("--book")) return rest;
	if (rest[0] && !rest[0].startsWith("--")) {
		return ["--book", rest[0], ...rest.slice(1)];
	}
	// The current book, else the only one: a project's one book need not be named.
	const book = focusBook ?? (books.length === 1 ? books[0] : undefined);
	return book ? ["--book", book, ...rest] : rest;
}

/** Writes a merge or sync: moves, then edits, then removals. */
export function applyChanges(changes: FileChange[]) {
	for (const change of changes) {
		if (change.kind !== "move") continue;
		mkdirSync(dirname(change.to), { recursive: true });
		if (change.text === undefined) {
			renameSync(change.path, change.to);
		} else {
			writeFileSync(change.to, change.text);
			rmSync(change.path);
		}
	}
	for (const change of changes) {
		if (change.kind === "edit") writeFileSync(change.path, change.text);
	}
	for (const change of changes) {
		if (change.kind === "remove") rmSync(change.path, { force: true });
	}
	// A folder a move emptied, such as examples/<drop>/.
	for (const change of changes) {
		if (change.kind !== "move") continue;
		const folder = dirname(change.path);
		if (existsSync(folder) && readdirSync(folder).length === 0) {
			rmdirSync(folder);
		}
	}
}

/** One line per change, as paths from the workspace root. */
export function printChanges(changes: FileChange[]) {
	const at = (path: string) => relative(repoRoot(), path);
	for (const change of changes) {
		if (change.kind === "move") {
			console.log(`  → ${at(change.path)} → ${at(change.to)}`);
		} else if (change.kind === "edit") {
			console.log(`  ~ ${at(change.path)}`);
		} else {
			console.log(`  - ${at(change.path)}`);
		}
	}
}
