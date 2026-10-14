/**
 * Probe for bet B1 (docs/bets.md): does Cloudflare's Clef decision model answer
 * the author's merge rule ("same lever and same evidence") better than a cosine
 * cutoff? Read-only: it prints a report and writes nothing.
 *
 * It asks Clef three typed questions about each pair of mechanisms and scores
 * the pair as P(same lever) × P(same evidence). It passes when every merge in
 * corpus.json scores above every pair the author ruled distinct.
 *
 *   bun scratch/clef-probe.ts --dry-run          # print one request and the token estimate; no network
 *   bun scratch/clef-probe.ts                    # the 3 merges and 15 distinct rulings (18 calls)
 *   bun scratch/clef-probe.ts --all              # also every pair in today's corpus (435 more calls, about $0.05 on clef)
 *   bun scratch/clef-probe.ts --model clef-flash # cheaper model (worse at "none of these")
 *
 * Sends through `scratch/clef.ts`: the Workers AI API when CLOUDFLARE_ACCOUNT_ID
 * and CLOUDFLARE_API_TOKEN are set, otherwise the signed-in `cf` CLI. Answers
 * are cached, so reruns are free. Merge sides are compared on the fields corpus.json kept for them
 * (title, definition, is), so today's mechanisms are read the same way.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../scripts/_lib";
import { loadBookContent } from "../scripts/lib/load-book";
import { askClef, CLEF_PRICE, parseClefModel } from "./clef";

type Side = { slug: string; title: string; definition: string; is: string[] };
type Pair = { a: Side; b: Side; label: "merge" | "distinct" | "unruled" };
type Verdict = {
	pair: Pair;
	lever: number;
	evidence: number;
	score: number;
	relation: string;
	relationP: number;
};

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const all = args.includes("--all");
const model = parseClefModel(args, "clef");

const corpus = JSON.parse(
	readFileSync(join(repoRoot(), "corpus.json"), "utf8"),
) as {
	books: string[];
	distinct: Array<{ pair: [string, string] }>;
	merged: Array<{ into: string; before: [Side, Side] }>;
};

const today = new Map<string, Side>();
for (const book of corpus.books) {
	for (const mechanism of loadBookContent(book).mechanisms) {
		today.set(mechanism.slug, mechanism);
	}
}

const pairKey = (a: string, b: string) => [a, b].sort().join("\u0000");
const pairs: Pair[] = corpus.merged.map((merge) => ({
	a: merge.before[0],
	b: merge.before[1],
	label: "merge",
}));
const ruled = new Set<string>();
for (const { pair } of corpus.distinct) {
	const a = today.get(pair[0]);
	const b = today.get(pair[1]);
	if (!a || !b) continue;
	ruled.add(pairKey(a.slug, b.slug));
	pairs.push({ a, b, label: "distinct" });
}
if (all) {
	const slugs = [...today.keys()];
	for (let i = 0; i < slugs.length; i += 1) {
		for (let j = i + 1; j < slugs.length; j += 1) {
			if (ruled.has(pairKey(slugs[i], slugs[j]))) continue;
			pairs.push({
				a: today.get(slugs[i]) as Side,
				b: today.get(slugs[j]) as Side,
				label: "unruled",
			});
		}
	}
}

const describe = (side: Side) =>
	[
		`${side.title} (${side.slug})`,
		`Definition: ${side.definition}`,
		...side.is.map((line) => `Covers: ${line}`),
	].join("\n");

// The relation options come from the reasons the author gave in corpus.json
// for ruling pairs distinct.
const questions = {
	same_lever: {
		type: "noul",
		instructions:
			"Do A and B name the same lever: the same thing someone does or arranges that produces the harm?",
	},
	same_evidence: {
		type: "noul",
		instructions:
			"Would A and B be confirmed by the same evidence, using the same test to check whether the mechanism is operating?",
	},
	relation: {
		type: "choice",
		instructions: "What is the relationship between mechanism A and B?",
		criteria: {
			same_idea: "The same idea under two names: same lever and same evidence.",
			cause_effect:
				"One is a cause or a special case of the other, which is a broader result.",
			before_after:
				"One acts before harm (prevention, refusal) and the other after it (undoing, recourse).",
			different_target:
				"Similar machinery aimed at different targets, such as the institution's cover versus a gate on the person.",
			same_family:
				"Related ideas in one family that work through different levers.",
			unrelated: "Different ideas with little in common.",
		},
	},
} as const;

const requestBody = (pair: Pair) => ({
	state: `Two mechanisms from a body of nonfiction about institutions.\n\nMechanism A:\n${describe(pair.a)}\n\nMechanism B:\n${describe(pair.b)}`,
	questions,
});

if (dryRun) {
	const body = { model, ...requestBody(pairs[0]) };
	const tokens = pairs.reduce(
		(sum, pair) => sum + JSON.stringify(requestBody(pair)).length / 4,
		0,
	);
	const allPairs = (today.size * (today.size - 1)) / 2;
	console.log(JSON.stringify(body, null, 2));
	console.log(
		`\n${pairs.length} requests, about ${Math.round(tokens / 1000)}K input tokens. About $${((tokens / 1e6) * CLEF_PRICE[model]).toFixed(4)} on ${model}.${all ? "" : ` --all adds the rest of today's ${allPairs} pairs.`}`,
	);
	process.exit(0);
}

const ask = async (pair: Pair): Promise<Verdict> => {
	const { state, questions: asked } = requestBody(pair);
	const { answers } = await askClef(model, { state, questions: asked });
	const lever = answers.same_lever?.noul ?? Number.NaN;
	const evidence = answers.same_evidence?.noul ?? Number.NaN;
	const relation = answers.relation?.choice ?? "?";
	return {
		pair,
		lever,
		evidence,
		score: lever * evidence,
		relation,
		relationP: answers.relation?.probabilities?.[relation] ?? Number.NaN,
	};
};

const verdicts: Verdict[] = [];
for (const pair of pairs) {
	verdicts.push(await ask(pair));
}
verdicts.sort((x, y) => y.score - x.score);

const pct = (p: number) => `${Math.round(p * 100)}%`.padStart(4);
console.log(
	`CLEF PROBE (${model}; ${verdicts.length} pairs; score = P(same lever) × P(same evidence))`,
);
for (const [rank, v] of verdicts.entries()) {
	if (v.pair.label === "unruled" && rank >= 15) continue;
	console.log(
		`${String(rank + 1).padStart(3)}. ${v.pair.label.padEnd(8)} ${pct(v.score)}  lever ${pct(v.lever)} evidence ${pct(v.evidence)}  ${v.relation} ${pct(v.relationP)}  ${v.pair.a.slug} ~ ${v.pair.b.slug}`,
	);
}

const merges = verdicts.filter((v) => v.pair.label === "merge");
const distinct = verdicts.filter((v) => v.pair.label === "distinct");
const lowestMerge = Math.min(...merges.map((v) => v.score));
const highestDistinct = Math.max(...distinct.map((v) => v.score));
const passed = lowestMerge > highestDistinct;
console.log(
	`\n${passed ? "PASS" : "FAIL"}: lowest merge ${pct(lowestMerge)}, highest pair ruled distinct ${pct(highestDistinct)}.`,
);
if (all) {
	const flagged = verdicts.filter(
		(v) => v.pair.label === "unruled" && v.score >= lowestMerge,
	);
	console.log(
		`Unruled pairs today at or above the lowest merge: ${flagged.length}. The embedding models flag 2 (nomic) and 7–22 (EmbeddingGemma 2) at their catch-every-merge cutoffs.`,
	);
}
console.log(
	"Three merges can rule this out but cannot prove it. Record the result in the B1 log in docs/bets.md either way.",
);
