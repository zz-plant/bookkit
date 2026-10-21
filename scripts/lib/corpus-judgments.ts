import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
	type CorpusMechanism,
	corpusEmbeddingText,
	decidePair,
	JUDGE_RELATIONS,
	type JudgeRelation,
	type JudgeVote,
	lexicalMechanismSimilarity,
	type PairCall,
	type PairJudgment,
} from "../../packages/astro-bookkit/src/suggestions";

/**
 * corpus-judgments.json: judges' verdicts on pairs of mechanisms, for
 * check:corpus (see packages/astro-bookkit/src/suggestions/corpus-judgment.ts).
 *
 * A verdict is about two texts, so each record keeps a hash of both. When a
 * mechanism's title, definition, or what it covers changes, its old verdicts
 * stop applying and the pair is listed for judging again.
 *
 * Judging happens outside the compiler, with whatever model or person the
 * author trusts: `--judge-prompt <dir>` writes the question and the pairs,
 * blind (no slugs, books, or rulings); `--judge-record <dir>` reads the
 * answers back. CI only reads the file.
 */

export const JUDGMENTS_FILE = "corpus-judgments.json";

/** Where a request folder keeps the command that answered judge n (see judge-runner.ts). */
export const commandFile = (folder: string, judge: number): string =>
	join(folder, `judge-${judge}`, "command.txt");

/** One judge's answer, with who gave it and when. */
export type RecordedVote = JudgeVote & { judge: string; date: string };

export type JudgmentRecord = {
	pair: [string, string];
	/** Hashes of each side's text, in pair order (see textHash). */
	texts: [string, string];
	votes: RecordedVote[];
};

export type JudgmentsFile = { $comment?: string; judgments: JudgmentRecord[] };

type Text = Pick<CorpusMechanism, "title" | "definition" | "is">;

/** What a judge reads of a mechanism, hashed: the same text the meaning pass embeds. */
export const textHash = (mechanism: Text): string =>
	createHash("sha256")
		.update(corpusEmbeddingText(mechanism))
		.digest("hex")
		.slice(0, 16);

const COMMENT =
	"Judges' verdicts on pairs of mechanisms, read by check:corpus (bet B1, docs/bets.md). Each record holds hashes of both texts as judged; when a text changes, its verdicts stop applying. Written by check:corpus --judge-record; edit by hand only to remove a record.";

const isProbability = (value: unknown): value is number =>
	typeof value === "number" && value >= 0 && value <= 1;

const isVote = (value: unknown): value is RecordedVote => {
	const vote = value as Partial<RecordedVote> | null;
	return (
		typeof vote === "object" &&
		vote !== null &&
		JUDGE_RELATIONS.includes(vote.relation as JudgeRelation) &&
		isProbability(vote.sameLever) &&
		isProbability(vote.sameEvidence) &&
		(vote.command === undefined || typeof vote.command === "string")
	);
};

const isRecord = (value: unknown): value is JudgmentRecord => {
	const record = value as Partial<JudgmentRecord> | null;
	return (
		typeof record === "object" &&
		record !== null &&
		Array.isArray(record.pair) &&
		record.pair.length === 2 &&
		Array.isArray(record.texts) &&
		record.texts.length === 2 &&
		Array.isArray(record.votes) &&
		record.votes.every(isVote)
	);
};

/** The file's records; a missing file is empty, an unreadable one an error. */
export const readJudgments = (
	root: string,
): { records: JudgmentRecord[] } | { error: string } => {
	const path = join(root, JUDGMENTS_FILE);
	if (!existsSync(path)) return { records: [] };
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8")) as JudgmentsFile;
		const records = Array.isArray(parsed.judgments) ? parsed.judgments : [];
		const bad = records.findIndex((record) => !isRecord(record));
		if (bad !== -1) {
			return {
				error: `${JUDGMENTS_FILE}: judgment ${bad + 1} is not a { pair, texts, votes } record with a relation from ${JUDGE_RELATIONS.join(", ")} and probabilities from 0 to 1 in each vote. Fix or remove it.`,
			};
		}
		return { records };
	} catch (error) {
		return {
			error: `${JUDGMENTS_FILE} is not valid JSON (${error instanceof Error ? error.message : String(error)}). Fix it or remove it.`,
		};
	}
};

/**
 * JSON as Biome formats it here (tabs, width 80): a short array of strings
 * on one line, so a recorded file passes check:format as written.
 */
export const formatJson = (value: unknown): string =>
	`${JSON.stringify(value, null, "\t").replace(
		/^(\t*)("[^"\n]*": )\[\n((?:\t+"[^"\n]*",?\n)+)\t*\]/gm,
		(whole, indent: string, key: string, items: string) => {
			const strings = items
				.trim()
				.split("\n")
				.map((item) => item.trim().replace(/,$/, ""));
			const line = `${key}[${strings.join(", ")}]`;
			return indent.length * 2 + line.length + 1 <= 80
				? `${indent}${line}`
				: whole;
		},
	)}\n`;

export const writeJudgments = (root: string, records: JudgmentRecord[]) => {
	writeFileSync(
		join(root, JUDGMENTS_FILE),
		formatJson({ $comment: COMMENT, judgments: records }),
	);
};

const sameSides = (record: JudgmentRecord, a: string, b: string) =>
	(record.pair[0] === a && record.pair[1] === b) ||
	(record.pair[0] === b && record.pair[1] === a);

/** The record's hash for one side, whichever order the pair was recorded in. */
const hashOf = (record: JudgmentRecord, slug: string) =>
	record.texts[record.pair[0] === slug ? 0 : 1];

/**
 * Verdicts that apply to the mechanisms as they read now, merged per pair,
 * and the pairs whose verdicts were on texts that have changed since.
 */
export const matchJudgments = (
	records: JudgmentRecord[],
	mechanisms: ReadonlyArray<Text & { slug: string }>,
): { current: PairJudgment[]; changed: Array<[string, string]> } => {
	const hashes = new Map<string, string>();
	for (const mechanism of mechanisms) {
		if (!hashes.has(mechanism.slug))
			hashes.set(mechanism.slug, textHash(mechanism));
	}
	const current = new Map<string, PairJudgment>();
	const changed = new Map<string, [string, string]>();
	for (const record of records) {
		const [a, b] = record.pair;
		if (!hashes.has(a) || !hashes.has(b)) continue;
		const key = [a, b].sort().join("\u0000");
		if (
			hashOf(record, a) === hashes.get(a) &&
			hashOf(record, b) === hashes.get(b)
		) {
			const entry = current.get(key) ?? { pair: [a, b], votes: [] };
			entry.votes.push(...record.votes);
			current.set(key, entry);
		} else {
			changed.set(key, [a, b]);
		}
	}
	for (const key of current.keys()) changed.delete(key);
	return { current: [...current.values()], changed: [...changed.values()] };
};

/**
 * How close two mechanisms are, for choosing which pairs to ask judges about:
 * the cosine of their vectors when both have one, else how alike their
 * wording is. `--judge-for` and `bookkit check` rank with this.
 */
export const pairCloseness = (
	a: CorpusMechanism,
	b: CorpusMechanism,
	vectorA?: ArrayLike<number> | null,
	vectorB?: ArrayLike<number> | null,
): number => {
	if (!vectorA || !vectorB) return lexicalMechanismSimilarity(a, b).combined;
	let dot = 0;
	for (let i = 0; i < vectorA.length; i += 1) dot += vectorA[i] * vectorB[i];
	return dot;
};

/** A mechanism's nearest others, closest first (see pairCloseness). */
export const nearestTo = (
	target: CorpusMechanism,
	others: readonly CorpusMechanism[],
	count: number,
	vectorOf?: (mechanism: CorpusMechanism) => ArrayLike<number> | null,
): CorpusMechanism[] =>
	others
		.filter((other) => other.slug !== target.slug)
		.map((other) => ({
			other,
			closeness: pairCloseness(
				target,
				other,
				vectorOf?.(target),
				vectorOf?.(other),
			),
		}))
		.sort((x, y) => y.closeness - x.closeness)
		.slice(0, count)
		.map(({ other }) => other);

/** The judges' calls on one mechanism's pairs, as the texts read now; same idea and splits first. */
export const callsFor = (
	slug: string,
	records: JudgmentRecord[],
	mechanisms: ReadonlyArray<Text & { slug: string }>,
): Array<{ other: string; call: PairCall }> => {
	const order = { "same-idea": 0, split: 1, distinct: 2 };
	return matchJudgments(records, mechanisms)
		.current.filter((judgment) => judgment.pair.includes(slug))
		.flatMap((judgment) => {
			const call = decidePair(judgment.votes);
			const other =
				judgment.pair[0] === slug ? judgment.pair[1] : judgment.pair[0];
			return call ? [{ other, call }] : [];
		})
		.sort((x, y) => order[x.call.call] - order[y.call.call]);
};

/** Votes recorded on two texts, whatever the slugs were called then. */
export const votesOn = (
	records: JudgmentRecord[],
	a: Text & { slug: string },
	b: Text & { slug: string },
): RecordedVote[] => {
	const [ha, hb] = [textHash(a), textHash(b)];
	return records
		.filter(
			(record) =>
				(record.texts[0] === ha && record.texts[1] === hb) ||
				(record.texts[0] === hb && record.texts[1] === ha),
		)
		.flatMap((record) => record.votes);
};

/** The author's merge rule, as judges are asked it and as a rubric states it. */
export const MERGE_RULE =
	"combine two mechanisms only if they are the same idea, meaning they share BOTH the lever (the thing someone does or arranges that produces the harm) AND the evidence (the test you would use to check whether the mechanism is operating). Related ideas in the same family are not the same idea.";

/**
 * The question, as the 2026-10-14 blind judges got it (scratch/blind-judge/),
 * worded for any number of pairs. The relation options name the kinds of
 * difference the author's rulings give.
 */
export const judgePrompt = (
	pairCount: number,
	pairs: string,
): string => `<!-- Written by bun run bookkit judge. Give one judge this whole prompt, in a session that sees nothing else. -->
You are a blind judge. Everything you need is in this message.

Do not open, list, or search any file or directory, do not run commands, do not search the web, and do not look at any repository. Judge only from the pairs at the end of this message.

They are ${pairCount} pair${pairCount === 1 ? "" : "s"} of "mechanisms" from one author's nonfiction. Each mechanism has a title, a definition, and what it covers. For each pair, the author applies this rule: ${MERGE_RULE}

For every pair, give:
- same_lever: your probability (0 to 1) that A and B name the same lever.
- same_evidence: your probability (0 to 1) that A and B would be confirmed by the same evidence / the same test.
- relation: exactly one of
  - "same_idea": the same idea under two names: same lever and same evidence.
  - "cause_effect": one is a cause or a special case of the other, which is a broader result.
  - "before_after": one acts before harm (prevention, refusal) and the other after it (undoing, recourse).
  - "different_target": similar machinery aimed at different targets, such as the institution's cover versus a gate on the person.
  - "same_family": related ideas in one family that work through different levers.
  - "unrelated": different ideas with little in common.
- relation_p: your probability that the relation you chose is right.

Use the full range of probabilities; be calibrated, not polite. Judge each pair on its own.

Your final message must be ONLY a JSON array with one object per pair, in any order, like:
[{"id":"P01","same_lever":0.12,"same_evidence":0.08,"relation":"same_family","relation_p":0.6}, ...]
No prose before or after the JSON.

The pairs:

${pairs}`;

type KeyEntry = {
	id: string;
	pair: [string, string];
	texts: [string, string];
};

/**
 * Writes a request for `judges` independent judges: key.json (ids to slugs
 * and text hashes, for recording; keep it from the judges), and for each
 * judge a folder judge-<n>/ with pairs.json (what it sees: neutral ids, sides
 * shuffled) and prompt.md, the question with those pairs in it, so it can be
 * pasted into any session or piped to any command as is. Each judge sees the
 * pairs in its own order, as the 2026-10-14 judges did, so no position effect
 * is shared. Answers go in the request folder as answer-<n>.json.
 */
export const writeJudgeRequest = (
	dir: string,
	pairs: ReadonlyArray<[Text & { slug: string }, Text & { slug: string }]>,
	judges = 3,
): string[] => {
	mkdirSync(dir, { recursive: true });
	// Seeded shuffles, so neither the order nor the side gives anything away.
	let seed = 20261014;
	const random = () => {
		seed = (seed * 1103515245 + 12345) % 2147483648;
		return seed / 2147483648;
	};
	const shuffled = <T>(items: T[]): T[] => {
		const copy = [...items];
		for (let i = copy.length - 1; i > 0; i -= 1) {
			const j = Math.floor(random() * (i + 1));
			[copy[i], copy[j]] = [copy[j], copy[i]];
		}
		return copy;
	};
	const side = (mechanism: Text) => ({
		title: mechanism.title,
		definition: mechanism.definition,
		covers: mechanism.is,
	});
	const visible = [];
	const key: KeyEntry[] = [];
	for (const [position, index] of shuffled(pairs.map((_, i) => i)).entries()) {
		const id = `P${String(position + 1).padStart(2, "0")}`;
		const [first, second] =
			random() < 0.5 ? pairs[index] : [pairs[index][1], pairs[index][0]];
		visible.push({ id, A: side(first), B: side(second) });
		key.push({
			id,
			pair: [first.slug, second.slug],
			texts: [textHash(first), textHash(second)],
		});
	}
	writeFileSync(join(dir, "key.json"), `${JSON.stringify(key, null, "\t")}\n`);
	const prompts: string[] = [];
	for (let judge = 1; judge <= judges; judge += 1) {
		const folder = join(dir, `judge-${judge}`);
		mkdirSync(folder, { recursive: true });
		const seen = `${JSON.stringify(judge === 1 ? visible : shuffled(visible), null, "\t")}\n`;
		writeFileSync(join(folder, "pairs.json"), seen);
		const promptPath = join(folder, "prompt.md");
		writeFileSync(promptPath, judgePrompt(pairs.length, seen));
		prompts.push(promptPath);
	}
	return prompts;
};

type Answer = {
	id?: unknown;
	same_lever?: unknown;
	same_evidence?: unknown;
	relation?: unknown;
	relation_p?: unknown;
};

/** The ids a request asks about, with each pair's slugs and text hashes. */
const readKey = (dir: string): KeyEntry[] | { error: string } => {
	const keyPath = join(dir, "key.json");
	if (!existsSync(keyPath)) {
		return {
			error: `No key.json in ${dir}. Write a request with bun run bookkit judge first.`,
		};
	}
	return JSON.parse(readFileSync(keyPath, "utf8")) as KeyEntry[];
};

/**
 * One judge's reply as votes, one per pair in the key. The reply may carry
 * prose around the JSON array; the array is taken. `file` names the reply in
 * errors.
 */
const votesIn = (
	text: string,
	key: KeyEntry[],
	file: string,
	judge: string,
	date: string,
	command?: string,
): Array<{ entry: KeyEntry; vote: RecordedVote }> | { error: string } => {
	const byId = new Map(key.map((entry) => [entry.id, entry]));
	const start = text.indexOf("[");
	const end = text.lastIndexOf("]");
	let answers: Answer[];
	try {
		answers = JSON.parse(text.slice(start, end + 1)) as Answer[];
		if (!Array.isArray(answers)) throw new Error("not an array");
	} catch {
		return { error: `${file} holds no JSON array of answers.` };
	}
	const votes: Array<{ entry: KeyEntry; vote: RecordedVote }> = [];
	for (const answer of answers) {
		const entry = byId.get(String(answer.id));
		const vote = {
			judge,
			date,
			relation: answer.relation as JudgeRelation,
			sameLever: answer.same_lever as number,
			sameEvidence: answer.same_evidence as number,
			...(isProbability(answer.relation_p)
				? { relationP: answer.relation_p }
				: {}),
			...(command ? { command } : {}),
		};
		if (!entry || !isVote(vote)) {
			return {
				error: `${file}: answer ${JSON.stringify(answer)} needs an id from pairs.json, a relation from ${JUDGE_RELATIONS.join(", ")}, and same_lever and same_evidence from 0 to 1.`,
			};
		}
		votes.push({ entry, vote });
	}
	const seen = new Set(votes.map(({ entry }) => entry.id));
	const missing = key.filter((entry) => !seen.has(entry.id));
	if (missing.length > 0) {
		return {
			error: `${file} answers ${seen.size} of ${key.length} pairs; missing ${missing.map((entry) => entry.id).join(", ")}. Ask the judge again for every pair.`,
		};
	}
	return votes;
};

/** Why a judge's reply to the request in `dir` cannot be recorded, or null if it can. */
export const checkAnswer = (
	dir: string,
	text: string,
	file: string,
): string | null => {
	const key = readKey(dir);
	if ("error" in key) return key.error;
	const votes = votesIn(text, key, file, file, "");
	return "error" in votes ? votes.error : null;
};

/**
 * Reads every answer*.json in a request folder (one judge each) into records.
 * When bookkit asked judge n itself, its votes carry the command that answered
 * (judge-<n>/command.txt); a reply saved by hand carries none, unless that
 * file is written beside it.
 */
export const readAnswers = (
	dir: string,
	date: string,
): { records: JudgmentRecord[]; judges: string[] } | { error: string } => {
	const key = readKey(dir);
	if ("error" in key) return key;
	const files = readdirSync(dir)
		.filter((file) => /^answer.*\.json$/i.test(file))
		.sort();
	if (files.length === 0) {
		return {
			error: `No answers in ${dir}. Save each judge's reply there as answer-1.json, answer-2.json, and so on.`,
		};
	}
	const records = new Map<string, JudgmentRecord>();
	for (const file of files) {
		const judge = `${dir.split(/[\\/]/).filter(Boolean).pop()}/${file}`;
		const number = file.match(/^answer-(\d+)\.json$/i)?.[1];
		const asked = number ? commandFile(dir, Number(number)) : null;
		const command =
			asked && existsSync(asked)
				? readFileSync(asked, "utf8").trim() || undefined
				: undefined;
		const votes = votesIn(
			readFileSync(join(dir, file), "utf8"),
			key,
			file,
			judge,
			date,
			command,
		);
		if ("error" in votes) return votes;
		for (const { entry, vote } of votes) {
			const record = records.get(entry.id) ?? {
				pair: entry.pair,
				texts: entry.texts,
				votes: [],
			};
			record.votes.push(vote);
			records.set(entry.id, record);
		}
	}
	return { records: [...records.values()], judges: files };
};

/** Adds new votes to the records, keeping one record per pair and pair of texts. */
export const mergeRecords = (
	existing: JudgmentRecord[],
	added: JudgmentRecord[],
): JudgmentRecord[] => {
	const merged = existing.map((record) => ({
		...record,
		votes: [...record.votes],
	}));
	for (const record of added) {
		const [a, b] = record.pair;
		const match = merged.find(
			(other) =>
				sameSides(other, a, b) &&
				hashOf(other, a) === hashOf(record, a) &&
				hashOf(other, b) === hashOf(record, b),
		);
		if (match) {
			const known = new Set(match.votes.map((vote) => vote.judge));
			match.votes.push(
				...record.votes.filter((vote) => !known.has(vote.judge)),
			);
		} else {
			merged.push(record);
		}
	}
	return merged;
};
