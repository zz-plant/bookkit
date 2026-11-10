import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The active bet as `corpus.json` records it (docs/bets.md holds the
 * contract), and what a change or a date means against it. Pure apart from
 * `readBet`, so `verify` and `bookkit bets` share one reading.
 */

export type BetExclusion = {
	/** The bet's own word for the work it excludes, e.g. "reader UI". */
	what: string;
	/** Repo-relative path prefixes that work lives under. */
	paths: string[];
};

export type Bet = {
	id: string;
	title?: string;
	since?: string;
	killBy?: string;
	/** The book whose stubs are the next chapters to write. */
	focusBook?: string;
	/** The books that existed when the bet excluded new ones; unset: not checked. */
	knownBooks?: string[];
	/** The test: this many chapters drafted, binding at most this many new mechanisms. */
	test: { chapters: number; maxNewMechanisms: number };
	isNot: BetExclusion[];
};

const strings = (value: unknown): string[] =>
	Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];

const text = (value: unknown): string | undefined =>
	typeof value === "string" && value.trim() ? value.trim() : undefined;

/** The `bet` entry of a parsed corpus.json; `null` when it names no bet. */
export const parseBet = (corpus: unknown): Bet | null => {
	const raw = (corpus as { bet?: Record<string, unknown> } | null)?.bet;
	const id = text(raw?.id);
	if (!raw || !id) return null;
	const isNot = Array.isArray(raw.isNot)
		? raw.isNot.flatMap((entry: Record<string, unknown> | null) => {
				const what = text(entry?.what);
				const paths = strings(entry?.paths);
				return what && paths.length > 0 ? [{ what, paths }] : [];
			})
		: [];
	const test = (raw.test ?? {}) as Record<string, unknown>;
	const count = (value: unknown, fallback: number) =>
		typeof value === "number" && Number.isInteger(value) && value >= 0
			? value
			: fallback;
	const knownBooks = strings(raw.knownBooks);
	return {
		id,
		knownBooks: knownBooks.length > 0 ? knownBooks : undefined,
		test: {
			chapters: count(test.chapters, 3),
			maxNewMechanisms: count(test.maxNewMechanisms, 1),
		},
		title: text(raw.title),
		since: text(raw.since),
		killBy: text(raw.killBy),
		focusBook: text(raw.focusBook),
		isNot,
	};
};

export const readBet = (root: string): Bet | null => {
	const path = join(root, "corpus.json");
	if (!existsSync(path)) return null;
	try {
		return parseBet(JSON.parse(readFileSync(path, "utf8")));
	} catch {
		return null;
	}
};

/** Whole days since `killBy` passed; 0 or less while the bet still has time. */
export const daysPastKillBy = (bet: Bet, now: Date): number =>
	bet.killBy
		? Math.floor(
				(now.getTime() - Date.parse(`${bet.killBy}T00:00:00Z`)) / 86_400_000,
			)
		: 0;

export type OutOfBet = { what: string; files: string[] };

/** The changed files that fall under work the bet excludes, by exclusion. */
export const outOfBet = (changed: string[], bet: Bet): OutOfBet[] => {
	const byPath = bet.isNot.flatMap(({ what, paths }) => {
		const files = changed.filter((file) =>
			paths.some((prefix) => file.startsWith(prefix)),
		);
		return files.length > 0 ? [{ what, files }] : [];
	});
	const known = bet.knownBooks;
	const inNewBook = known
		? changed.filter((file) => {
				const book = file.match(/^apps\/([^/]+)\//)?.[1];
				return book !== undefined && !known.includes(book);
			})
		: [];
	return inNewBook.length > 0
		? [...byPath, { what: "new books", files: inNewBook }]
		: byPath;
};

/**
 * What `verify` says about a change and the bet. Never fails a run: the
 * author can ask for excluded work, and the note is there so it is a choice.
 */
export const betNote = (
	changed: string[],
	bet: Bet | null,
	now: Date,
): string | undefined => {
	if (!bet) return undefined;
	const outside = outOfBet(changed, bet);
	if (outside.length === 0) return undefined;
	const listed = outside
		.map(
			({ what, files }) =>
				`${what} (${files.length} file${files.length === 1 ? "" : "s"})`,
		)
		.join(", ");
	const past = daysPastKillBy(bet, now);
	return past > 0
		? `Bet ${bet.id} passed its killBy (${bet.killBy}) ${past} day${past === 1 ? "" : "s"} ago and excludes ${listed}. docs/bets.md needs a ruling before more of it.`
		: `Bet ${bet.id} excludes ${listed}. Go on only if the author asked for it; say so in the PR. bun run bookkit bets`;
};
