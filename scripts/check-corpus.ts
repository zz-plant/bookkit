import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	analyzeCorpusOverlap,
	type CorpusDistinctDecision,
	type CorpusMechanism,
	corpusEmbeddingText,
} from "../packages/astro-bookkit/src/suggestions";
import { listBookDirs, optionalArg, repoRoot } from "./_lib";
import { type CorpusMergeRecord, evaluateCorpusModel } from "./lib/corpus-eval";
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
 *   bun run check:corpus                                   # corpus.json books that exist, else every book
 *   bun run check:corpus -- --books bad-people,running-hot  # a chosen corpus
 *   bun run check:corpus -- --no-semantic                  # lexical only, no model
 *   bun run check:corpus -- --model minilm                 # another model (see EMBEDDING_MODELS)
 *   bun run check:corpus -- --threshold 0.5 --json
 *   bun run check:corpus -- --export corpus-report.json
 *   bun run check:corpus -- --mode error                   # exit 1 while anything is unresolved
 *   bun run check:corpus -- --eval [--model nomic,minilm]  # score models against the author's rulings
 *
 * corpus.json at the repo root, when present, names the default books, records
 * pairs the author reviewed and ruled distinct, and keeps each merge the author
 * made with both mechanisms as they were before it (for --eval):
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
const thresholdArg = optionalArg("--threshold");
const exportFile = optionalArg("--export");
const mode = optionalArg("--mode") ?? "warn";
const modelArg = optionalArg("--model");
const semanticRequested = !process.argv.includes("--no-semantic");
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

const available = listBookDirs();
// corpus.json may name books a fork or a standalone project does not have.
// Those are left out with a note; a book named with --books must exist.
const missingCorpusBooks = booksArg
	? []
	: (corpusFile.books ?? []).filter((book) => !available.includes(book));
const presentCorpusBooks = (corpusFile.books ?? []).filter((book) =>
	available.includes(book),
);
const books = booksArg
	? booksArg
			.split(",")
			.map((book) => book.trim())
			.filter(Boolean)
	: presentCorpusBooks.length > 0
		? presentCorpusBooks
		: available;

const unknown = books.filter((book) => !available.includes(book));
if (unknown.length > 0) {
	console.error(
		`Unknown book(s): ${unknown.join(", ")}. Run bun run list:books for the available slugs.`,
	);
	process.exit(1);
}
if (missingCorpusBooks.length > 0) {
	console.warn(
		`corpus.json lists book(s) not in apps/: ${missingCorpusBooks.join(", ")}. Checking ${presentCorpusBooks.length > 0 ? books.join(", ") : `every book in apps/ instead (${books.join(", ") || "none"})`}. Remove the missing ones from "books" in corpus.json.`,
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

if (evalRequested) {
	await runEval();
	process.exit(0);
}

let vectors: Float32Array[] | null = null;
let semanticNote = "semantic pass skipped (--no-semantic)";
if (semanticRequested && mechanisms.length > 1) {
	const embedded = await embedTexts(mechanisms.map(corpusEmbeddingText), model);
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

const report = analyzeCorpusOverlap(mechanisms, {
	vectors,
	semanticThreshold,
	distinct,
});

const bySlug = new Map(mechanisms.map((m) => [m.slug, m]));
const booksOf = (slug: string) =>
	mechanisms.filter((m) => m.slug === slug).map((m) => m.book);
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
	console.log(JSON.stringify(report, null, 2));
} else {
	console.log(
		`CORPUS OVERLAP (${report.books.length} book(s), ${report.mechanismCount} mechanisms)`,
	);
	console.log(`  ${semanticNote}`);
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
				strongest.semantic !== null ? `semantic ${strongest.semantic}` : null,
				`lexical ${strongest.lexical}`,
			]
				.filter(Boolean)
				.join(", ");
			console.log(
				`\n${index + 1}. ${cluster.books.length > 1 ? "across" : "within"} ${cluster.books.join(", ")} — strongest pair ${strongest.a} ~ ${strongest.b} (${scores})`,
			);
			for (const slug of cluster.members) {
				const mechanism = bySlug.get(slug);
				console.log(
					`   - ${slug} "${mechanism?.title ?? slug}" (${booksOf(slug).join(", ")})`,
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

	const unique = [...new Map(mechanisms.map((m) => [m.slug, m])).values()];
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
		const embedded = await embedTexts(texts, candidate);
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
