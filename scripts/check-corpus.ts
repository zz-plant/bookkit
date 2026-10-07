import { writeFileSync } from "node:fs";
import {
	analyzeCorpusOverlap,
	type CorpusMechanism,
	corpusEmbeddingText,
	corpusMechanismId,
	DEFAULT_SEMANTIC_OVERLAP_THRESHOLD,
} from "../packages/astro-bookkit/src/suggestions";
import { listBookDirs, optionalArg } from "./_lib";
import { DEFAULT_EMBEDDING_MODEL, embedTexts } from "./lib/embed-text";
import { loadBookContent } from "./lib/load-book";

/**
 * check:corpus — mechanism overlap across books.
 *
 *   bun run check:corpus                                   # every book
 *   bun run check:corpus -- --books bad-people,running-hot  # a chosen corpus
 *   bun run check:corpus -- --no-semantic                  # lexical only, no model
 *   bun run check:corpus -- --threshold 0.5 --json
 *   bun run check:corpus -- --export corpus.json
 *   bun run check:corpus -- --mode error                   # exit 1 while clusters remain
 */

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
	: listBookDirs();

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

const report = analyzeCorpusOverlap(mechanisms, {
	vectors,
	semanticThreshold,
});

const byId = new Map(mechanisms.map((m) => [corpusMechanismId(m), m]));

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
	if (report.clusters.length === 0) {
		console.log("\nNo overlapping mechanisms found.");
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
			for (const id of cluster.members) {
				const mechanism = byId.get(id);
				console.log(`   - ${id} "${mechanism?.title ?? id}"`);
				if (mechanism?.definition) {
					console.log(`       ${mechanism.definition}`);
				}
			}
		});
		console.log(
			"\n→ For each cluster, decide: one mechanism (keep one slug, repoint the rest) or distinct (sharpen is/isNot so each excludes the others).",
		);
	}
}

process.exit(mode === "error" && report.clusters.length > 0 ? 1 : 0);
