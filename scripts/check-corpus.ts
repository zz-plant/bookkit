import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	analyzeCorpusOverlap,
	type CorpusDistinctDecision,
	type CorpusMechanism,
	corpusEmbeddingText,
	DEFAULT_SEMANTIC_OVERLAP_THRESHOLD,
} from "../packages/astro-bookkit/src/suggestions";
import { listBookDirs, optionalArg, repoRoot } from "./_lib";
import { DEFAULT_EMBEDDING_MODEL, embedTexts } from "./lib/embed-text";
import { loadBookContent } from "./lib/load-book";

/**
 * check:corpus — mechanism overlap across books.
 *
 *   bun run check:corpus                                   # corpus.json books, else every book
 *   bun run check:corpus -- --books bad-people,running-hot  # a chosen corpus
 *   bun run check:corpus -- --no-semantic                  # lexical only, no model
 *   bun run check:corpus -- --threshold 0.5 --json
 *   bun run check:corpus -- --export corpus-report.json
 *   bun run check:corpus -- --mode error                   # exit 1 while anything is unresolved
 *
 * corpus.json at the repo root, when present, names the default books and
 * records pairs the author reviewed and ruled distinct:
 *
 *   { "books": ["a", "b"], "distinct": [{ "pair": ["slug-1", "slug-2"], "reason": "..." }] }
 */

type CorpusFile = { books?: string[]; distinct?: CorpusDistinctDecision[] };

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
const semanticRequested = !process.argv.includes("--no-semantic");
const asJson = process.argv.includes("--json");

const books = booksArg
	? booksArg
			.split(",")
			.map((book) => book.trim())
			.filter(Boolean)
	: (corpusFile.books ?? listBookDirs());

const unknown = books.filter((book) => !listBookDirs().includes(book));
if (unknown.length > 0) {
	console.error(
		`Unknown book(s): ${unknown.join(", ")}. Run bun run list:books for the available slugs.`,
	);
	process.exit(1);
}

const semanticThreshold = thresholdArg
	? Number(thresholdArg)
	: DEFAULT_SEMANTIC_OVERLAP_THRESHOLD;
if (Number.isNaN(semanticThreshold)) {
	console.error(`--threshold must be a number, got "${thresholdArg}".`);
	process.exit(1);
}

const mechanisms: CorpusMechanism[] = books.flatMap((book) =>
	loadBookContent(book).mechanisms.map((mechanism) => ({ ...mechanism, book })),
);

let vectors: Float32Array[] | null = null;
let semanticNote = "semantic pass skipped (--no-semantic)";
if (semanticRequested && mechanisms.length > 1) {
	const embedded = await embedTexts(mechanisms.map(corpusEmbeddingText));
	if (embedded.ok) {
		vectors = embedded.vectors;
		semanticNote = `semantic pass: ${embedded.model}, threshold ${semanticThreshold}`;
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
				model: vectors ? DEFAULT_EMBEDDING_MODEL : null,
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
