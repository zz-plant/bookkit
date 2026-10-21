import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { MechanismRecord } from "../../packages/astro-bookkit/src/suggestions";
import { listBookDirs, repoRoot } from "../_lib";
import { formatJson, MERGE_RULE, textHash } from "./corpus-judgments";
import type { DistinctRuling, MergeRecord } from "./corpus-rulings";
import { corpusScope, readCorpusBooks } from "./corpus-scope";
import { loadBookContent } from "./load-book";

/**
 * `bookkit export <book> --rubric`: a book's corpus of mechanisms as an eval
 * rubric, for grading text (a model's answer, a draft, a case) against named
 * ideas outside Bookkit.
 *
 * Each mechanism is a criterion with a stable id (its slug), when it applies
 * (`is`) and when it does not (`isNot`), what it predicts, and how to test
 * for it. The author's rulings in corpus.json come along as labelled pairs:
 * merges (two texts that are one idea) and distinct rulings with their
 * reasons, which are the hard negatives a grader gets wrong. A rubric's
 * `version` changes whenever any criterion's text does, so a score can name
 * the rubric it was given against.
 */

/** One mechanism as a rubric criterion. */
export type RubricCriterion = {
	id: string;
	title: string;
	definition: string;
	appliesWhen: string[];
	notWhen: string[];
	predictions: string[];
	tests: string[];
	books: string[];
	/** The hash judges' verdicts are recorded against (corpus-judgments.json). */
	textHash: string;
	/** Criteria the author ruled a different idea, and why. */
	distinctFrom: Array<{ id: string; reason: string }>;
	/** Mechanisms merged into this one, as recorded in corpus.json. */
	mergedFrom: Array<{ id: string; date: string; reason: string }>;
};

type PairSide = {
	id: string;
	title: string;
	definition: string;
	covers: string[];
};

/** An author's ruling on two texts: the answer key. */
export type RubricPair = {
	label: "same_idea" | "distinct";
	a: PairSide;
	b: PairSide;
	reason: string;
	/** For a merge, when it was made. */
	date?: string;
};

export type Rubric = {
	$comment: string;
	books: string[];
	version: string;
	rule: string;
	criteria: RubricCriterion[];
	pairs: RubricPair[];
};

const COMMENT =
	"An eval rubric written by bookkit export --rubric from the books' mechanisms and the author's rulings in corpus.json. criteria: one per mechanism, id = slug. pairs: the author's rulings as labelled examples (same_idea from merges, as both texts read before the merge; distinct with the reason). version changes when any criterion's text does. Edit the books, not this file.";

type Mechanism = MechanismRecord & { book: string };

const side = (m: {
	slug: string;
	title: string;
	definition: string;
	is: string[];
}): PairSide => ({
	id: m.slug,
	title: m.title,
	definition: m.definition,
	covers: m.is,
});

/**
 * The rubric for a set of mechanisms (one corpus) and its rulings. A shared
 * mechanism counts once, with every book it is in; its first copy's text is
 * used (check:corpus reports copies that drift apart).
 */
export const buildRubric = (
	mechanisms: readonly Mechanism[],
	rulings: { distinct?: DistinctRuling[]; merged?: MergeRecord[] },
): Rubric => {
	const bySlug = new Map<string, { first: Mechanism; books: string[] }>();
	for (const mechanism of mechanisms) {
		if (!mechanism.definition.trim()) continue;
		const entry = bySlug.get(mechanism.slug);
		if (entry) {
			if (!entry.books.includes(mechanism.book))
				entry.books.push(mechanism.book);
		} else {
			bySlug.set(mechanism.slug, { first: mechanism, books: [mechanism.book] });
		}
	}
	const inCorpus = (slug: string) => bySlug.has(slug);
	const distinct = (rulings.distinct ?? []).filter((ruling) =>
		ruling.pair.every(inCorpus),
	);
	const merged = (rulings.merged ?? []).filter(
		(merge) => inCorpus(merge.into) && merge.before.length === 2,
	);

	const criteria: RubricCriterion[] = [...bySlug.values()]
		.map(({ first, books }) => ({
			id: first.slug,
			title: first.title,
			definition: first.definition,
			appliesWhen: first.is,
			notWhen: first.isNot,
			predictions: first.predictions,
			tests: first.tests,
			books: [...books].sort(),
			textHash: textHash(first),
			distinctFrom: distinct
				.filter((ruling) => ruling.pair.includes(first.slug))
				.map((ruling) => ({
					id: ruling.pair[0] === first.slug ? ruling.pair[1] : ruling.pair[0],
					reason: ruling.reason,
				}))
				.sort((x, y) => x.id.localeCompare(y.id)),
			mergedFrom: merged
				.filter((merge) => merge.into === first.slug)
				.flatMap((merge) =>
					merge.before
						.filter((before) => before.slug !== first.slug)
						.map((before) => ({
							id: before.slug,
							date: merge.date,
							reason: merge.reason,
						})),
				),
		}))
		.sort((x, y) => x.id.localeCompare(y.id));

	const pairs: RubricPair[] = [
		...merged.map((merge) => ({
			label: "same_idea" as const,
			a: side(merge.before[0]),
			b: side(merge.before[1]),
			reason: merge.reason,
			date: merge.date,
		})),
		...distinct.map((ruling) => {
			const [a, b] = ruling.pair.map(
				(slug) => bySlug.get(slug)?.first as Mechanism,
			);
			return {
				label: "distinct" as const,
				a: side(a),
				b: side(b),
				reason: ruling.reason,
			};
		}),
	];

	const version = createHash("sha256")
		.update(JSON.stringify(criteria))
		.digest("hex")
		.slice(0, 16);
	return {
		$comment: COMMENT,
		books: [
			...new Set(criteria.flatMap((criterion) => criterion.books)),
		].sort(),
		version,
		rule: MERGE_RULE.charAt(0).toUpperCase() + MERGE_RULE.slice(1),
		criteria,
		pairs,
	};
};

/**
 * Writes the rubric for `book`'s corpus (the shared corpus when corpus.json
 * lists the book, else the book alone) to `out`, by default the book's
 * exports/rubric.json (gitignored, beside the GitBook export).
 */
export const exportRubric = (
	book: string,
	out?: string,
): { path: string; rubric: Rubric } | { error: string } => {
	const root = repoRoot();
	const books = listBookDirs();
	const scope = corpusScope(books, readCorpusBooks(root));
	const corpusPath = join(root, "corpus.json");
	let rulings: { distinct?: DistinctRuling[]; merged?: MergeRecord[] } = {};
	if (existsSync(corpusPath)) {
		try {
			rulings = JSON.parse(readFileSync(corpusPath, "utf8"));
		} catch (error) {
			return {
				error: `corpus.json is not valid JSON (${error instanceof Error ? error.message : String(error)}). Fix it first.`,
			};
		}
	}
	const corpus = books.filter(
		(other) => scope.corpusOf(other) === scope.corpusOf(book),
	);
	const mechanisms = corpus.flatMap((other) =>
		loadBookContent(other).mechanisms.map((m) => ({ ...m, book: other })),
	);
	const rubric = buildRubric(mechanisms, rulings);
	if (rubric.criteria.length === 0) {
		return {
			error: `${book} has no mechanisms with a definition, so there is nothing to grade against. Name one with bun run bookkit new mechanism ${book} "<title>".`,
		};
	}
	const path = out ?? join(root, "apps", book, "exports", "rubric.json");
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, formatJson(rubric));
	return { path, rubric };
};
