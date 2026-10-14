import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	analyzeCorpusOverlap,
	type CorpusDistinctDecision,
	type CorpusMechanism,
	corpusEmbeddingText,
} from "../packages/astro-bookkit/src/suggestions";
import { listBookDirs, optionalArg, repoRoot } from "./_lib";
import { didYouMean } from "./lib/cli";
import { type CorpusMergeRecord, evaluateCorpusModel } from "./lib/corpus-eval";
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
 *   bun run check:corpus -- --eval [--model nomic,minilm]  # score models against the author's rulings
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
// --eval measures models against the author's rulings, made on the shared corpus.
const evalBooks = explicitBooks ?? corpusFile.books ?? workspaceBooks;

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

const semanticThreshold = thresholdArg ? Number(thresholdArg) : model.threshold;
if (Number.isNaN(semanticThreshold)) {
	console.error(`--threshold must be a number, got "${thresholdArg}".`);
	process.exit(1);
}

const mechanisms: CorpusMechanism[] = books.flatMap((book) =>
	loadBookContent(book).mechanisms.map((mechanism) => ({ ...mechanism, book })),
);

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

// An explicit --books subset leaves other books' mechanisms out; rulings that
// name them are out of scope for this run, not stale.
const loadedSlugs = new Set(mechanisms.map((m) => m.slug));
const rulings = corpusFile.distinct ?? [];
const distinct = booksArg
	? rulings.filter((ruling) =>
			ruling.pair.every((slug) => loadedSlugs.has(slug)),
		)
	: rulings;

const fullReport = analyzeCorpusOverlap(mechanisms, {
	vectors,
	semanticThreshold,
	distinct,
	corpusOf: scope.corpusOf,
});

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
		});
		console.log(
			"\n→ For each cluster, decide: one mechanism (same slug and contract in every book that uses it) or distinct (add the pair to corpus.json with a reason).",
		);
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

	if (asJson) {
		console.log(JSON.stringify(results, null, 2));
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
}
