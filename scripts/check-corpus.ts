import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	analyzeCorpusOverlap,
	type CorpusDistinctDecision,
	type CorpusMechanism,
	type CorpusPair,
	corpusEmbeddingText,
	decidePair,
	describeCall,
	evaluateJudgments,
} from "../packages/astro-bookkit/src/suggestions";
import { listBookDirs, optionalArg, repoRoot } from "./_lib";
import { didYouMean } from "./lib/cli";
import { type CorpusMergeRecord, evaluateCorpusModel } from "./lib/corpus-eval";
import {
	JUDGMENTS_FILE,
	matchJudgments,
	mergeRecords,
	pairCloseness,
	readAnswers,
	readJudgments,
	votesOn,
	writeJudgeRequest,
	writeJudgments,
} from "./lib/corpus-judgments";
import { corpusScope } from "./lib/corpus-scope";
import {
	DEFAULT_EMBEDDING_MODEL_KEY,
	EMBEDDING_MODELS,
	type EmbeddingModel,
	embedTexts,
	resolveEmbeddingModel,
} from "./lib/embed-text";
import { loadBookContent } from "./lib/load-book";

/**
 * check:corpus — mechanism overlap across books.
 *
 *   bun run check:corpus                                   # every book (see below)
 *   bun run check:corpus -- --book garden-notes            # what concerns one book
 *   bun run check:corpus -- --books bad-people,running-hot  # a chosen corpus
 *   bun run check:corpus -- --no-semantic                  # lexical only, no model
 *   bun run check:corpus -- --download-model               # allow the model download without asking
 *   bun run check:corpus -- --model minilm                 # another model (see EMBEDDING_MODELS)
 *   bun run check:corpus -- --threshold 0.5 --json
 *   bun run check:corpus -- --export corpus-report.json
 *   bun run check:corpus -- --mode error                   # exit 1 while anything is unresolved
 *   bun run check:corpus -- --eval [--model nomic,minilm]  # score models and judges against the author's rulings
 *   bun run check:corpus -- --judge-prompt <dir> [--judge-top 10] [--judges 3]  # ask judges about pairs, blind
 *   bun run check:corpus -- --judge-prompt <dir> --judge-for <slug>  # only one mechanism's 3 nearest
 *   bun run check:corpus -- --judge-record <dir>           # record their answers in corpus-judgments.json
 *   (bun run bookkit judge [slug] and bookkit judge record run these with a folder in .bookkit/judging/)
 *
 * corpus.json at the repo root, when present, names the books in the shared
 * corpus, records pairs the author reviewed and ruled distinct, and keeps each
 * merge the author made with both mechanisms as they were before it (for
 * --eval). Every book is checked: books in the shared corpus against each
 * other, every other book against itself, and similar mechanisms in two
 * different corpora are listed for information without failing --mode error.
 * --books makes the books given one corpus. --eval scores against the shared
 * corpus only.
 *
 * corpus-judgments.json, when present, holds judges' verdicts on pairs: the
 * author's merge rule (same lever, same evidence) asked of an LLM or a person
 * who sees only the two texts. A pair any judge called the same idea is
 * flagged even when its wording differs, and each flagged pair shows the
 * judges' call (see packages/astro-bookkit/src/suggestions/corpus-judgment.ts).
 * Verdicts on a text that has changed since stop applying. Judging needs no
 * model here: --judge-prompt writes the question and the pairs to hand to
 * judges, and --judge-record reads their answers back.
 *
 *   {
 *     "books": ["a", "b"],
 *     "distinct": [{ "pair": ["slug-1", "slug-2"], "reason": "..." }],
 *     "merged": [{ "into": "slug-2", "date": "...", "reason": "...", "before": [{ "book", "slug", "title", "definition", "is" }, {...}] }]
 *   }
 */

type CorpusFile = {
	books?: string[];
	distinct?: CorpusDistinctDecision[];
	merged?: CorpusMergeRecord[];
};

const corpusPath = join(repoRoot(), "corpus.json");
let corpusFile: CorpusFile = {};
if (existsSync(corpusPath)) {
	try {
		corpusFile = JSON.parse(readFileSync(corpusPath, "utf8")) as CorpusFile;
	} catch (error) {
		console.error(
			`corpus.json is not valid JSON (${error instanceof Error ? error.message : String(error)}). Fix it or remove it.`,
		);
		process.exit(1);
	}
}

const booksArg = optionalArg("--books");
const bookArg = optionalArg("--book");
const thresholdArg = optionalArg("--threshold");
const exportFile = optionalArg("--export");
const mode = optionalArg("--mode") ?? "warn";
const modelArg = optionalArg("--model");
const semanticRequested = !process.argv.includes("--no-semantic");
const allowDownload = process.argv.includes("--download-model") || undefined;
const asJson = process.argv.includes("--json");
const evalRequested = process.argv.includes("--eval");
const judgePromptDir = optionalArg("--judge-prompt");
const judgeRecordDir = optionalArg("--judge-record");
const judgeFor = optionalArg("--judge-for");
const judgeCount = Number(optionalArg("--judges") ?? 3);
if (!Number.isInteger(judgeCount) || judgeCount < 1) {
	console.error(
		`--judges takes a whole number of judges, at least 1; got "${optionalArg("--judges")}".`,
	);
	process.exit(1);
}
// Every merge on record was among the two highest-scoring pairs in the whole
// corpus by meaning, so a mechanism's three nearest cover them with room.
const judgeTop = Number(optionalArg("--judge-top") ?? (judgeFor ? 3 : 10));
if (!Number.isInteger(judgeTop) || judgeTop < 0) {
	console.error(
		`--judge-top takes a whole number of pairs, got "${optionalArg("--judge-top")}".`,
	);
	process.exit(1);
}

const modelKeys = (modelArg ?? "")
	.split(",")
	.map((key) => key.trim())
	.filter(Boolean);
const unknownModels = modelKeys.filter((key) => !resolveEmbeddingModel(key));
if (unknownModels.length > 0) {
	console.error(
		`Unknown model(s): ${unknownModels.join(", ")}. Choose from: ${Object.keys(EMBEDDING_MODELS).join(", ")}.`,
	);
	process.exit(1);
}
if (!evalRequested && modelKeys.length > 1) {
	console.error(
		"--model takes one model, except with --eval, which compares several.",
	);
	process.exit(1);
}
const model = resolveEmbeddingModel(
	modelKeys[0] ?? DEFAULT_EMBEDDING_MODEL_KEY,
) as EmbeddingModel;

const workspaceBooks = listBookDirs();
const explicitBooks = booksArg
	? booksArg
			.split(",")
			.map((book) => book.trim())
			.filter(Boolean)
	: null;
const books = explicitBooks ?? workspaceBooks;
const scope = corpusScope(books, explicitBooks ?? corpusFile.books);
// corpus.json may name books a fork or a standalone project does not have.
// They are left out with a note; a book named with --books must exist.
const missingCorpusBooks = explicitBooks
	? []
	: (corpusFile.books ?? []).filter((book) => !workspaceBooks.includes(book));
const presentCorpusBooks = corpusFile.books?.filter((book) =>
	workspaceBooks.includes(book),
);
// --eval measures models against the author's rulings, made on the shared corpus.
const evalBooks =
	explicitBooks ??
	(presentCorpusBooks && presentCorpusBooks.length > 0
		? presentCorpusBooks
		: workspaceBooks);

const unknown = [...books, ...(bookArg ? [bookArg] : [])].filter(
	(book) => !workspaceBooks.includes(book),
);
if (unknown.length > 0) {
	console.error(
		`Unknown book(s): ${unknown.join(", ")}.${didYouMean(unknown[0], workspaceBooks)} Available books: ${workspaceBooks.join(", ")}.`,
	);
	process.exit(1);
}
if (bookArg && !books.includes(bookArg)) {
	console.error(`--book ${bookArg} is not among --books ${books.join(",")}.`);
	process.exit(1);
}
if (missingCorpusBooks.length > 0) {
	console.warn(
		`corpus.json lists book(s) not in apps/: ${missingCorpusBooks.join(", ")}. They are left out, with their rulings. Remove them from "books" in corpus.json.`,
	);
}

const semanticThreshold = thresholdArg ? Number(thresholdArg) : model.threshold;
if (Number.isNaN(semanticThreshold)) {
	console.error(`--threshold must be a number, got "${thresholdArg}".`);
	process.exit(1);
}

const loaded: CorpusMechanism[] = books.flatMap((book) =>
	loadBookContent(book).mechanisms.map((mechanism) => ({ ...mechanism, book })),
);
// A mechanism with no definition in any book has nothing to compare yet: by
// title alone, every new book's placeholder would match every other's.
const undefinedSlugs = new Set(
	loaded
		.filter((mechanism) =>
			loaded.every(
				(other) => other.slug !== mechanism.slug || !other.definition.trim(),
			),
		)
		.map((mechanism) => mechanism.slug),
);
const mechanisms = loaded.filter(
	(mechanism) => !undefinedSlugs.has(mechanism.slug),
);

const judgmentsRead = readJudgments(repoRoot());
if ("error" in judgmentsRead) {
	console.error(judgmentsRead.error);
	process.exit(1);
}
let judgmentRecords = judgmentsRead.records;

if (judgeRecordDir) {
	const read = readAnswers(
		judgeRecordDir,
		new Date().toISOString().slice(0, 10),
	);
	if ("error" in read) {
		console.error(read.error);
		process.exit(1);
	}
	judgmentRecords = mergeRecords(judgmentRecords, read.records);
	writeJudgments(repoRoot(), judgmentRecords);
	console.log(
		`Recorded ${read.judges.length} judge(s) on ${read.records.length} pair(s) in ${JUDGMENTS_FILE}:`,
	);
	const open: Array<[string, string]> = [];
	for (const judgment of matchJudgments(read.records, mechanisms).current) {
		const call = decidePair(judgment.votes);
		if (!call) continue;
		console.log(`  ${judgment.pair.join(" ~ ")}: ${describeCall(call)}`);
		const ruled = (corpusFile.distinct ?? []).some(({ pair }) =>
			judgment.pair.every((slug) => pair.includes(slug)),
		);
		if (call.call !== "distinct" && !ruled) open.push(judgment.pair);
	}
	if (open.length > 0) {
		console.log(
			`\nYours to settle (${open.length}): merge each pair into one mechanism, or rule it distinct with a reason that names each one's lever:`,
		);
		for (const [a, b] of open) {
			console.log(`  bun run bookkit rule ${a} ${b} --distinct "<reason>"`);
		}
	} else {
		console.log(
			"\nNo pair is the same idea. bun run bookkit check now counts these verdicts.",
		);
	}
	process.exit(0);
}

const judgments = matchJudgments(judgmentRecords, mechanisms);

if (evalRequested) {
	await runEval();
	process.exit(0);
}

let vectors: Float32Array[] | null = null;
let semanticNote = "semantic pass skipped (--no-semantic)";
if (semanticRequested && mechanisms.length > 1) {
	const embedded = await embedTexts(
		mechanisms.map(corpusEmbeddingText),
		model,
		{ allowDownload },
	);
	if (embedded.ok) {
		vectors = embedded.vectors;
		semanticNote = `semantic pass: ${model.key} (${model.id}), threshold ${semanticThreshold}`;
	} else {
		semanticNote = `semantic pass unavailable: ${embedded.reason}`;
	}
}

// A subset of books (--books, or corpus.json naming books that are not here)
// leaves other books' mechanisms out; rulings that name them are out of scope
// for this run, not stale. So are rulings on a mechanism with no definition.
const loadedSlugs = new Set(mechanisms.map((m) => m.slug));
const rulings = (corpusFile.distinct ?? []).filter(
	(ruling) => !ruling.pair.some((slug) => undefinedSlugs.has(slug)),
);
const distinct =
	booksArg || missingCorpusBooks.length > 0
		? rulings.filter((ruling) =>
				ruling.pair.every((slug) => loadedSlugs.has(slug)),
			)
		: rulings;

const fullReport = analyzeCorpusOverlap(mechanisms, {
	vectors,
	semanticThreshold,
	distinct,
	corpusOf: scope.corpusOf,
	judgments: judgments.current,
});

if (judgePromptDir) {
	writeJudgeRequestFor(judgePromptDir);
	process.exit(0);
}

// --book: only what involves that book. Stale rulings belong to the shared corpus.
const involves = (list: string[]) => !bookArg || list.includes(bookArg);
const report = {
	...fullReport,
	clusters: fullReport.clusters.filter((cluster) => involves(cluster.books)),
	shared: fullReport.shared.filter((record) => involves(record.books)),
	related: fullReport.related.filter((pair) =>
		involves([...pair.aBooks, ...pair.bBooks]),
	),
	staleDecisions:
		!bookArg || scope.shared.includes(bookArg) ? fullReport.staleDecisions : [],
};

const mechanismIn = (slug: string, books: string[]) =>
	mechanisms.find((m) => m.slug === slug && books.includes(m.book));
const drifted = report.shared.filter(
	(record) => record.driftedFields.length > 0,
);
const unresolved =
	report.clusters.length + drifted.length + report.staleDecisions.length;

if (exportFile) {
	writeFileSync(
		exportFile,
		`${JSON.stringify(
			{
				generatedAt: new Date().toISOString(),
				model: vectors ? model.id : null,
				semanticThreshold: vectors ? semanticThreshold : null,
				...report,
			},
			null,
			2,
		)}\n`,
	);
}

if (asJson) {
	console.log(
		JSON.stringify(
			{
				...report,
				// Why "semantic" is false when the meaning pass was asked for.
				semanticNote,
				judgments: {
					pairs: judgments.current.length,
					changedSinceJudged: judgments.changed,
				},
				scope: { shared: scope.shared, separate: scope.separate },
			},
			null,
			2,
		),
	);
} else {
	console.log(
		`CORPUS OVERLAP (${report.books.length} book(s), ${report.mechanismCount} mechanisms)`,
	);
	const corpusSource = explicitBooks ? "--books" : 'corpus.json "books"';
	if (bookArg && scope.separate.includes(bookArg)) {
		console.log(
			`  ${bookArg} is not in ${corpusSource}, so its mechanisms are compared with each other; similar ones in other books are listed for information.`,
		);
	} else if (scope.separate.length > 0) {
		console.log(
			`  shared corpus (${corpusSource}): ${scope.shared.join(", ")}`,
		);
		console.log(
			`  checked on their own: ${scope.separate.join(", ")} (add a book to "books" in corpus.json to hold it to the shared vocabulary)`,
		);
	}
	console.log(`  ${semanticNote}`);
	if (judgments.current.length > 0 || judgments.changed.length > 0) {
		console.log(
			`  judges: verdicts on ${judgments.current.length} pair(s) in ${JUDGMENTS_FILE}${judgments.changed.length > 0 ? `; ${judgments.changed.length} changed since judged (${judgments.changed.map((pair) => pair.join(" ~ ")).join(", ")}): ask again with bun run bookkit judge` : ""}`,
		);
	}
	if (undefinedSlugs.size > 0) {
		console.log(
			`  not compared until they have a definition: ${[...undefinedSlugs].join(", ")}`,
		);
	}
	if (report.shared.length > 0) {
		console.log(
			`  shared across books: ${report.shared.map((record) => `${record.slug} (${record.books.join(", ")})`).join("; ")}`,
		);
	}
	if (report.reviewedDistinct.length > 0) {
		console.log(
			`  ${report.reviewedDistinct.length} flagged pair(s) already ruled distinct in corpus.json`,
		);
	}
	for (const record of drifted) {
		console.log(
			`\nDRIFT: "${record.slug}" is shared by ${record.books.join(", ")} but the copies differ in ${record.driftedFields.join(", ")}.`,
		);
		console.log(
			"  → Make the contracts identical, or use different slugs if the books mean different things.",
		);
	}
	for (const decision of report.staleDecisions) {
		console.log(
			`\nSTALE DECISION: corpus.json rules ${decision.pair.join(" ~ ")} distinct, but one of them no longer exists. Remove or update it.`,
		);
	}
	if (report.clusters.length === 0) {
		console.log("\nNo unresolved overlapping mechanisms.");
	} else {
		console.log(
			`\n${report.clusters.length} cluster(s) covering ${report.clusters.reduce((n, c) => n + c.members.length, 0)} mechanisms. Folding each cluster into one mechanism would leave ${report.countIfMerged} of ${report.mechanismCount}.`,
		);
		report.clusters.forEach((cluster, index) => {
			const strongest = cluster.strongest;
			const scores = [
				strongest.flaggedBy.includes("judged") ? "judged the same idea" : null,
				strongest.semantic !== null ? `semantic ${strongest.semantic}` : null,
				`lexical ${strongest.lexical}`,
			]
				.filter(Boolean)
				.join(", ");
			console.log(
				`\n${index + 1}. ${cluster.books.length > 1 ? "across" : "within"} ${cluster.books.join(", ")} — strongest pair ${strongest.a} ~ ${strongest.b} (${scores})`,
			);
			for (const slug of cluster.members) {
				const mechanism = mechanismIn(slug, cluster.books);
				const holders = mechanisms
					.filter((m) => m.slug === slug && cluster.books.includes(m.book))
					.map((m) => m.book);
				console.log(
					`   - ${slug} "${mechanism?.title ?? slug}" (${holders.join(", ")})`,
				);
				if (mechanism?.definition) {
					console.log(`       ${mechanism.definition}`);
				}
			}
			for (const pair of cluster.pairs) printJudged(pair);
		});
		console.log(
			'\n→ For each cluster, decide: one mechanism (same slug and contract in every book that uses it), or distinct: bun run bookkit rule <a> <b> --distinct "<reason>".',
		);
		const unjudged = report.clusters
			.flatMap((cluster) => cluster.pairs)
			.filter((pair) => !pair.judged).length;
		if (unjudged > 0) {
			console.log(
				`  ${unjudged} flagged pair(s) have no judges' verdict yet: bun run bookkit judge writes the question for them.`,
			);
		}
	}
	if (report.related.length > 0) {
		console.log(
			`\nSIMILAR ACROSS CORPORA (${report.related.length}, for information; nothing to resolve)`,
		);
		const shown = 10;
		for (const pair of report.related.slice(0, shown)) {
			const scores = [
				pair.semantic !== null ? `semantic ${pair.semantic}` : null,
				`lexical ${pair.lexical}`,
			]
				.filter(Boolean)
				.join(", ");
			// The checked book's side first.
			const sides = [
				`${pair.a} (${pair.aBooks.join(", ")})`,
				`${pair.b} (${pair.bBooks.join(", ")})`,
			];
			if (bookArg && pair.bBooks.includes(bookArg)) sides.reverse();
			console.log(`- ${sides.join(" ~ ")}: ${scores}`);
		}
		if (report.related.length > shown) {
			console.log(
				`  and ${report.related.length - shown} more (--json lists them all)`,
			);
		}
		console.log(
			'  These books do not share a corpus, so similar mechanisms are allowed. To hold two books to one vocabulary, list both in "books" in corpus.json.',
		);
	}
}

process.exit(mode === "error" && unresolved > 0 ? 1 : 0);

/** The judges' call under a flagged pair, with a draft ruling when they found it distinct. */
function printJudged(pair: CorpusPair): void {
	if (!pair.judged) return;
	console.log(`   ${pair.a} ~ ${pair.b}: ${describeCall(pair.judged)}`);
	if (pair.judged.call === "same-idea") {
		console.log(
			`     → likely one mechanism. Merge them, or: bun run bookkit rule ${pair.a} ${pair.b} --distinct "<reason naming each lever>"`,
		);
	} else if (pair.judged.call === "split") {
		console.log(
			`     → the judges disagree; your ruling settles it: merge, or bun run bookkit rule ${pair.a} ${pair.b} --distinct "<reason>"`,
		);
	} else {
		console.log(
			`     → bun run bookkit rule ${pair.a} ${pair.b} --distinct "<reason>"  (the judges' draft, to rewrite naming each lever: ${pair.judged.draft})`,
		);
	}
}

/**
 * check:corpus --judge-prompt: the pairs worth a judge's time, most useful
 * first. Flagged pairs with no verdict, then pairs whose text changed since
 * judged, then the closest unjudged, unruled pairs (by meaning when the model
 * ran, else by wording), up to --judge-top. With --judge-for, only pairs
 * that include that mechanism.
 */
function writeJudgeRequestFor(dir: string): void {
	const embedded = vectors;
	const bySlug = new Map(mechanisms.map((m) => [m.slug, m]));
	if (judgeFor && !bySlug.has(judgeFor)) {
		console.error(
			`--judge-for ${judgeFor}: no mechanism with that slug and a definition.${didYouMean(judgeFor, [...bySlug.keys()])}`,
		);
		process.exit(1);
	}
	const involves = (a: string, b: string) =>
		!judgeFor || a === judgeFor || b === judgeFor;
	const key = (a: string, b: string) => [a, b].sort().join("\u0000");
	const judged = new Set(judgments.current.map((j) => key(...j.pair)));
	const ruled = new Set(distinct.map((d) => key(...d.pair)));
	const chosen = new Map<string, [CorpusMechanism, CorpusMechanism]>();
	const add = (a: string, b: string) => {
		const left = bySlug.get(a);
		const right = bySlug.get(b);
		if (left && right && !chosen.has(key(a, b)))
			chosen.set(key(a, b), [left, right]);
	};
	const flagged = fullReport.pairs.filter(
		(pair) => !judged.has(key(pair.a, pair.b)) && involves(pair.a, pair.b),
	);
	const changed = judgments.changed.filter(([a, b]) => involves(a, b));
	for (const pair of flagged) add(pair.a, pair.b);
	for (const [a, b] of changed) add(a, b);
	const candidates: Array<{ a: string; b: string; score: number }> = [];
	const unique = [...bySlug.values()];
	for (let i = 0; i < unique.length; i += 1) {
		for (let j = i + 1; j < unique.length; j += 1) {
			const [a, b] = [unique[i], unique[j]];
			if (!involves(a.slug, b.slug)) continue;
			if (scope.corpusOf(a.book) !== scope.corpusOf(b.book)) continue;
			const pairKey = key(a.slug, b.slug);
			if (judged.has(pairKey) || ruled.has(pairKey) || chosen.has(pairKey))
				continue;
			const ia = mechanisms.indexOf(a);
			const ib = mechanisms.indexOf(b);
			const score = pairCloseness(a, b, embedded?.[ia], embedded?.[ib]);
			candidates.push({ a: a.slug, b: b.slug, score });
		}
	}
	candidates.sort((x, y) => y.score - x.score);
	for (const candidate of candidates.slice(0, judgeTop))
		add(candidate.a, candidate.b);
	if (chosen.size === 0) {
		console.log(
			"Nothing to judge: every flagged pair has a verdict, and --judge-top is 0 or every pair is judged or ruled.",
		);
		return;
	}
	const prompts = writeJudgeRequest(dir, [...chosen.values()], judgeCount);
	console.log(
		`Wrote ${chosen.size} pair(s) to judge in ${dir}: ${flagged.length} flagged without a verdict, ${changed.length} changed since judged, the rest the closest unjudged${judgeFor ? ` to ${judgeFor}` : ""} by ${embedded ? "meaning" : "wording"}.`,
	);
	console.log(
		`\nAsk ${prompts.length} judge(s), each in a fresh session (an LLM or a person) that sees nothing but its prompt. Each prompt names its own copy of the pairs, in its own order:\n${prompts.map((prompt) => `  ${prompt}`).join("\n")}\nSave judge n's reply as ${join(dir, "answer-<n>.json")}, then: bun run bookkit judge record`,
	);
}

/**
 * check:corpus --eval: scores each model against the author's rulings. Merges
 * are scored on both mechanisms as they were before the author combined them,
 * against every pair in today's corpus.
 */
async function runEval(): Promise<void> {
	const merged = corpusFile.merged ?? [];
	if (merged.length === 0) {
		console.error(
			'corpus.json has no merge rulings ("merged") to score models against. Record a merge with both mechanisms as they were before it.',
		);
		process.exit(1);
	}

	const unique = [
		...new Map(
			mechanisms
				.filter((m) => evalBooks.includes(m.book))
				.map((m) => [m.slug, m]),
		).values(),
	];
	const slugs = unique.map((mechanism) => mechanism.slug);
	const loaded = new Set(slugs);
	const distinct = (corpusFile.distinct ?? []).filter((ruling) =>
		ruling.pair.every((slug) => loaded.has(slug)),
	);
	const texts = [
		...unique.map(corpusEmbeddingText),
		...merged.flatMap((merge) => merge.before.map(corpusEmbeddingText)),
	];
	const candidates =
		modelKeys.length > 0
			? modelKeys.map((key) => EMBEDDING_MODELS[key])
			: Object.values(EMBEDDING_MODELS);

	const results = [];
	for (const candidate of candidates) {
		const started = performance.now();
		const embedded = await embedTexts(texts, candidate, { allowDownload });
		const seconds = Math.round((performance.now() - started) / 1000);
		if (!embedded.ok) {
			results.push({ model: candidate, error: embedded.reason });
			continue;
		}
		const vectors = embedded.vectors;
		const report = evaluateCorpusModel({
			slugs,
			vectors: vectors.slice(0, slugs.length),
			merges: merged.map((merge, index) => ({
				into: merge.into,
				vectors: [
					vectors[slugs.length + 2 * index],
					vectors[slugs.length + 2 * index + 1],
				],
			})),
			distinct,
			threshold: thresholdArg ? semanticThreshold : candidate.threshold,
		});
		results.push({ model: candidate, seconds, report });
	}

	const bySlug = new Map(
		unique.map((mechanism) => [mechanism.slug, mechanism]),
	);
	const judgeRulings = [
		...merged.map((merge) => ({
			pair: [merge.before[0].slug, merge.before[1].slug] as [string, string],
			ruled: "merge" as const,
			votes: votesOn(judgmentRecords, merge.before[0], merge.before[1]),
		})),
		...distinct.map((ruling) => {
			const [a, b] = ruling.pair.map((slug) => bySlug.get(slug));
			return {
				pair: ruling.pair,
				ruled: "distinct" as const,
				votes: a && b ? votesOn(judgmentRecords, a, b) : [],
			};
		}),
	];
	const judges = evaluateJudgments(judgeRulings);

	if (asJson) {
		console.log(JSON.stringify({ models: results, judges }, null, 2));
		return;
	}

	const pairCount = (slugs.length * (slugs.length - 1)) / 2;
	const plural = (n: number, word: string) =>
		`${n} ${word}${n === 1 ? "" : "s"}`;
	console.log(
		`CORPUS MODEL EVAL (${slugs.length} mechanisms, ${pairCount} pairs; ${plural(merged.length, "merge ruling")}, ${plural(distinct.length, "distinct ruling")})`,
	);
	console.log(
		"  Each merge is scored on both mechanisms as they were before the author combined them, against every pair in today's corpus.",
	);
	for (const result of results) {
		const { model: candidate } = result;
		const label = `${candidate.key}: ${candidate.id}${candidate.key === DEFAULT_EMBEDDING_MODEL_KEY ? " (default)" : ""}`;
		if (!("report" in result) || !result.report) {
			console.log(`\n${label}\n  unavailable: ${result.error}`);
			continue;
		}
		const { report, seconds } = result;
		console.log(`\n${label}, ${seconds}s`);
		for (const merge of report.merges) {
			console.log(
				`  merge into ${merge.into}: ${merge.score.toFixed(2)}, ${plural(merge.outrankedBy, "pair")} today ${merge.outrankedBy === 1 ? "scores" : "score"} higher`,
			);
		}
		if (report.topRuledDistinct) {
			console.log(
				`  highest pair ruled distinct: ${report.topRuledDistinct.a} ~ ${report.topRuledDistinct.b} ${report.topRuledDistinct.score.toFixed(2)}`,
			);
		}
		for (const [name, at] of [
			["at its cutoff", report.atThreshold],
			["at the cutoff that catches every merge", report.atCatchAll],
		] as const) {
			console.log(
				`  ${name} ${at.cutoff.toFixed(2)}: catches ${at.mergesCaught}/${report.merges.length} merges; flags ${plural(at.flagged, "pair")} today (${at.ruledDistinct} ruled distinct, ${at.unreviewed.length} unreviewed)`,
			);
		}
		for (const pair of report.atThreshold.unreviewed) {
			console.log(
				`    unreviewed at its cutoff: ${pair.a} ~ ${pair.b} ${pair.score.toFixed(2)}`,
			);
		}
	}
	console.log(
		"\n→ A better model catches every merge while flagging fewer pairs. Unreviewed pairs at a model's cutoff are what check:corpus reports for the author to rule on when that model runs.",
	);

	const votes = judgeRulings.reduce((n, ruling) => n + ruling.votes.length, 0);
	console.log(
		`\nJUDGES (${JUDGMENTS_FILE}): ${judges.scored} of ${judgeRulings.length} rulings have verdicts on the text as ruled, ${votes} votes`,
	);
	if (judges.scored === 0) {
		console.log(
			"  Nothing to score: no verdicts are recorded on the ruled pairs as they read when ruled.",
		);
		return;
	}
	const { table, scoreCutoff } = judges;
	console.log(
		"  decision table (every judge says same idea: merge; some do: yours to rule; none do: distinct):",
	);
	console.log(
		`    ${table.right} right, ${table.wrong.length} wrong, ${table.left.length} left to you`,
	);
	for (const [label, misses] of [
		["wrong", table.wrong],
		["left to you", table.left],
	] as const) {
		for (const miss of misses) {
			console.log(
				`    ${label}: ${miss.pair.join(" ~ ")} (ruled ${miss.ruled}): ${describeCall(miss.call)}`,
			);
		}
	}
	console.log(
		`  lever × evidence score, cutoff fitted on the other rulings (leave one out): ${scoreCutoff.right} right, ${scoreCutoff.wrong.length} wrong`,
	);
	for (const miss of scoreCutoff.wrong) {
		console.log(
			`    wrong: ${miss.pair.join(" ~ ")} (ruled ${miss.ruled}, score ${miss.call.score.toFixed(2)})`,
		);
	}
	if (judges.unjudged.length > 0) {
		console.log(
			`  no verdicts on the text as ruled: ${judges.unjudged.map((pair) => pair.join(" ~ ")).join(", ")}`,
		);
	}
	console.log(
		"\n→ The table never needs a cutoff, so it cannot be fitted to these rulings; the score needs one, and a cutoff fitted on three merges can move with the fourth.",
	);
}
