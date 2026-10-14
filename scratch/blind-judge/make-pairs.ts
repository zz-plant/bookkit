// Blind-judge probe for bet B1 (docs/bets.md): does asking the author's merge
// rule (same lever, same evidence) separate the merges in corpus.json from the
// pairs ruled distinct, when the judge sees only the mechanism texts?
//
// Builds the judge set: 3 merges (sides as they were before the merge), the
// distinct rulings, and the 12 unruled pairs nomic scores highest. Writes
// pairs.json (neutral ids; no slugs, books, or labels) and key.json (the
// answers) into <out>. Keep key.json out of the judges' reach.
//
//   bun scratch/blind-judge/make-pairs.ts <out>        # from the repo root
//   # give each judge prompt.md and its own copy of pairs.json, save each
//   # judge's JSON answer, then:
//   python3 -I scratch/blind-judge/score.py <out>/key.json judge1.json judge2.json ...
//
// results/ holds the 2026-10-14 run (three Claude subagents, three pair orders).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2];
const repo = process.cwd();
const { loadBookContent } = await import(
	join(repo, "scripts/lib/load-book.ts")
);
const { corpusEmbeddingText } = await import(
	join(repo, "packages/astro-bookkit/src/suggestions/index.ts")
);
const { embedTexts, EMBEDDING_MODELS } = await import(
	join(repo, "scripts/lib/embed-text.ts")
);

type Side = { slug: string; title: string; definition: string; is: string[] };
const corpus = JSON.parse(readFileSync(join(repo, "corpus.json"), "utf8"));
const today = new Map<string, Side>();
for (const book of corpus.books) {
	for (const m of loadBookContent(book).mechanisms) today.set(m.slug, m);
}
const key = (a: string, b: string) => [a, b].sort().join("~");

const pairs: Array<{ a: Side; b: Side; label: string; nomic?: number }> = [];
for (const m of corpus.merged)
	pairs.push({ a: m.before[0], b: m.before[1], label: "merge" });
const ruled = new Set<string>();
for (const { pair } of corpus.distinct) {
	const a = today.get(pair[0]);
	const b = today.get(pair[1]);
	if (!a || !b) continue;
	ruled.add(key(a.slug, b.slug));
	pairs.push({ a, b, label: "distinct" });
}

const slugs = [...today.keys()];
const embedded = await embedTexts(
	slugs.map((s) => corpusEmbeddingText(today.get(s))),
	EMBEDDING_MODELS.nomic,
);
if (!embedded.ok) throw new Error(embedded.reason);
const v = embedded.vectors;
const dot = (x: Float32Array, y: Float32Array) =>
	x.reduce((s, xi, i) => s + xi * y[i], 0);
const unruled: Array<{ a: Side; b: Side; label: string; nomic: number }> = [];
for (let i = 0; i < slugs.length; i++) {
	for (let j = i + 1; j < slugs.length; j++) {
		if (ruled.has(key(slugs[i], slugs[j]))) continue;
		unruled.push({
			a: today.get(slugs[i]) as Side,
			b: today.get(slugs[j]) as Side,
			label: "unruled",
			nomic: dot(v[i], v[j]),
		});
	}
}
unruled.sort((x, y) => y.nomic - x.nomic);
pairs.push(...unruled.slice(0, 12));

// Deterministic shuffle so ids carry no order information.
let seed = 20261014;
const rand = () => {
	seed = (seed * 1103515245 + 12345) % 2147483648;
	return seed / 2147483648;
};
for (let i = pairs.length - 1; i > 0; i--) {
	const j = Math.floor(rand() * (i + 1));
	[pairs[i], pairs[j]] = [pairs[j], pairs[i]];
}
const strip = (s: Side) => ({
	title: s.title,
	definition: s.definition,
	covers: s.is,
});
const visible = pairs.map((p, i) => ({
	id: `P${String(i + 1).padStart(2, "0")}`,
	A: strip(rand() < 0.5 ? p.a : p.b),
	B: null as unknown,
}));
// Fill B with the other side.
pairs.forEach((p, i) => {
	visible[i].B = strip(visible[i].A.title === p.a.title ? p.b : p.a);
});
writeFileSync(join(out, "pairs.json"), JSON.stringify(visible, null, 1));
writeFileSync(
	join(out, "key.json"),
	JSON.stringify(
		pairs.map((p, i) => ({
			id: visible[i].id,
			label: p.label,
			a: p.a.slug,
			b: p.b.slug,
			nomic: p.nomic ?? null,
		})),
		null,
		1,
	),
);
console.log(
	`${pairs.length} pairs; ${JSON.stringify(visible).length} chars visible`,
);
