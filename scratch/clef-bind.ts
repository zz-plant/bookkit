/**
 * Probe for bet B1 (docs/bets.md): B1's test is that the next three chapters
 * introduce at most one new mechanism between them. This asks Clef, for each
 * chapter with prose, which of the corpus's mechanisms the chapter relies on
 * and whether it names an idea of its own. Read-only: it prints a report and
 * writes nothing to the repo.
 *
 * The chapter's `mechanisms:` frontmatter is the answer key, and is never sent.
 * Mechanism slugs are blanked from the prose, so the model has to recognise
 * the idea rather than the identifier. The check passes when declared
 * mechanisms outscore undeclared ones in at least 90% of pairs.
 *
 *   bun scratch/clef-bind.ts --dry-run            # one request and the cost; no network
 *   bun scratch/clef-bind.ts                      # every chapter with 150+ words (clef-omni)
 *   bun scratch/clef-bind.ts --model clef         # the text model
 *   bun scratch/clef-bind.ts --file <chapter.mdx> # one chapter, e.g. a new draft
 *
 * Sends through `scratch/clef.ts` (the Workers AI API or the signed-in `cf`
 * CLI); answers are cached, so reruns are free.
 */
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { MechanismRecord } from "../packages/astro-bookkit/src/suggestions";
import { repoRoot } from "../scripts/_lib";
import { parseFrontmatter } from "../scripts/lib/content-frontmatter";
import { loadBookContent } from "../scripts/lib/load-book";
import { askClef, CLEF_PRICE, parseClefModel } from "./clef";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const model = parseClefModel(args, "clef-omni");
const fileIndex = args.indexOf("--file");
const onlyFile = fileIndex >= 0 ? args[fileIndex + 1] : undefined;
const MIN_WORDS = 150;
const NEW_IDEA = "names_new_idea";

const corpus = JSON.parse(
	readFileSync(join(repoRoot(), "corpus.json"), "utf8"),
) as { books: string[] };

// Shared mechanisms appear in more than one book with the same contract.
const mechanisms = new Map<string, MechanismRecord>();
type Chapter = {
	book: string;
	file: string;
	title: string;
	declared: string[];
	body: string;
};
const chapters: Chapter[] = [];
for (const book of corpus.books) {
	const content = loadBookContent(book);
	for (const mechanism of content.mechanisms) {
		mechanisms.set(mechanism.slug, mechanism);
	}
	for (const chapter of content.chapters) {
		chapters.push({
			book,
			file: chapter.file ?? chapter.slug,
			title: chapter.title,
			declared: chapter.mechanisms,
			body: chapter.body ?? "",
		});
	}
}
if (onlyFile) {
	const { data, body } = parseFrontmatter(readFileSync(onlyFile, "utf8"));
	chapters.length = 0;
	chapters.push({
		book: "(draft)",
		file: onlyFile,
		title: String(data.title ?? onlyFile),
		declared: Array.isArray(data.mechanisms) ? data.mechanisms.map(String) : [],
		body,
	});
}

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
const slugPattern = new RegExp(
	[...mechanisms.keys()]
		.sort((a, b) => b.length - a.length)
		.map((slug) => slug.replace(/[-]/g, "\\-"))
		.join("|"),
	"g",
);
const blanked = (body: string) => body.replace(slugPattern, "[…]");

const questions: Record<string, unknown> = {};
for (const mechanism of mechanisms.values()) {
	questions[mechanism.slug] = {
		type: "noul",
		instructions: `Does the chapter rely on this mechanism, by any name: "${mechanism.title}", ${mechanism.definition}`,
	};
}
questions[NEW_IDEA] = {
	type: "noul",
	instructions:
		"Does the chapter coin and name a mechanism of its own (a named pattern of how harm is produced) that is none of the mechanisms asked about here?",
};

const requestFor = (chapter: Chapter) => ({
	state: `A chapter from a body of nonfiction about institutions.\n\nTitle: ${chapter.title}\n\n${blanked(chapter.body)}`,
	questions,
});

const scored = chapters.filter(
	(chapter) => onlyFile || words(chapter.body) >= MIN_WORDS,
);

if (dryRun) {
	const tokens = scored.reduce(
		(sum, chapter) => sum + JSON.stringify(requestFor(chapter)).length / 4,
		0,
	);
	console.log(
		JSON.stringify({ model, ...requestFor(scored[0]) }, null, 2).slice(0, 3000),
	);
	console.log(
		`\n${scored.length} chapters with ${MIN_WORDS}+ words, ${mechanisms.size} mechanisms asked about. About ${Math.round(tokens / 1000)}K input tokens, $${((tokens / 1e6) * CLEF_PRICE[model]).toFixed(4)} on ${model}.`,
	);
	process.exit(0);
}

const pct = (p: number) => `${Math.round(p * 100)}%`.padStart(4);
let ordered = 0;
let comparisons = 0;
let spentTokens = 0;
console.log(
	`CLEF BINDING (${model}; ${scored.length} chapters; ${mechanisms.size} mechanisms)`,
);
for (const chapter of scored) {
	const { answers, inputTokens, cached } = await askClef(
		model,
		requestFor(chapter),
	);
	if (!cached) spentTokens += inputTokens;
	const scores = [...mechanisms.keys()]
		.map((slug) => ({ slug, p: answers[slug]?.noul ?? Number.NaN }))
		.sort((x, y) => y.p - x.p);
	const declared = new Set(chapter.declared);
	for (const d of scores.filter((s) => declared.has(s.slug))) {
		for (const u of scores.filter((s) => !declared.has(s.slug))) {
			comparisons += 1;
			if (d.p > u.p) ordered += 1;
		}
	}
	const rankOf = (slug: string) => scores.findIndex((s) => s.slug === slug) + 1;
	console.log(
		`\n${chapter.book}/${relative(join(repoRoot(), "apps", chapter.book, "src/content/book/chapters"), chapter.file)}  (${words(chapter.body)} words; names its own idea ${pct(answers[NEW_IDEA]?.noul ?? Number.NaN)})`,
	);
	console.log(
		`  declared: ${chapter.declared.length ? chapter.declared.map((slug) => `${slug} ${pct(scores[rankOf(slug) - 1]?.p ?? Number.NaN)} (#${rankOf(slug)})`).join(", ") : "none"}`,
	);
	const unbound = scores.filter((s) => !declared.has(s.slug) && s.p >= 0.5);
	console.log(
		`  undeclared at 50%+: ${unbound.length ? unbound.map((s) => `${s.slug} ${pct(s.p)}`).join(", ") : "none"}`,
	);
}

if (comparisons > 0) {
	const share = ordered / comparisons;
	console.log(
		`\n${share >= 0.9 ? "PASS" : "FAIL"}: declared mechanisms outscore undeclared ones in ${pct(share)} of ${comparisons} pairs (pass at 90%).`,
	);
}
console.log(
	`Spent about $${((spentTokens / 1e6) * CLEF_PRICE[model]).toFixed(4)} (${spentTokens} new input tokens). The answer key is the author's frontmatter, which can be incomplete: an undeclared mechanism at 50%+ is a question for the author, not an error.`,
);
