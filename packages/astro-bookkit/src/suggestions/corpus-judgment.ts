/**
 * Calls on mechanism pairs from recorded judge verdicts (bet B1, docs/bets.md).
 *
 * A judge, an LLM or a person who sees only the two mechanisms' texts, is
 * asked the author's merge rule: do they share the lever, do they share the
 * evidence, and which relation holds between them. Verdicts are recorded
 * (corpus-judgments.json, written by `check:corpus --judge-record`); this
 * module turns them into a call the compiler makes the same way every time,
 * with no model at hand. AI proposes; the author still rules.
 *
 * The table reads the relation votes, not the probabilities. On the author's
 * 18 rulings in the 2026-10-14 blind run (three judges), every judge called
 * each of the 3 merges "same idea", and 1 of the 45 votes on the 15 pairs
 * ruled distinct did: the table gets 17 right, 0 wrong, and leaves that pair
 * to the author. The same judges' lever-times-evidence score separates the
 * rulings by only 0.08 to 0.13 per judge; with its cutoff fitted on the other
 * rulings (leave one out), it gets 2 of 18 wrong (`check:corpus --eval`).
 */

/** The relations a judge chooses from, as worded in the judge prompt. */
export const JUDGE_RELATIONS = [
	"same_idea",
	"cause_effect",
	"before_after",
	"different_target",
	"same_family",
	"unrelated",
] as const;

export type JudgeRelation = (typeof JUDGE_RELATIONS)[number];

/** One judge's answer on one pair. */
export type JudgeVote = {
	relation: JudgeRelation;
	/** Probability the two name the same lever. */
	sameLever: number;
	/** Probability the same evidence would confirm both. */
	sameEvidence: number;
	/** The judge's confidence in its relation, when given. */
	relationP?: number;
	/**
	 * The command that answered, when bookkit asked the judge itself
	 * (`bookkit judge --run`), so judges can be scored per model.
	 */
	command?: string;
};

/** The verdicts recorded on one pair of mechanisms, as they read today. */
export type PairJudgment = {
	pair: [string, string];
	votes: JudgeVote[];
};

/**
 * - `same-idea`: every judge called it the same idea; merge, or rule it
 *   distinct with a reason.
 * - `split`: some judges did; the author's ruling decides.
 * - `distinct`: none did; `relation` is the judges' most common answer and
 *   `draft` a starting point for the ruling's reason.
 */
export type PairCall =
	| { call: "same-idea"; votes: number; score: number }
	| {
			call: "split";
			votes: number;
			sameIdea: number;
			score: number;
			others: Array<Exclude<JudgeRelation, "same_idea">>;
	  }
	| {
			call: "distinct";
			votes: number;
			score: number;
			relation: Exclude<JudgeRelation, "same_idea">;
			draft: string;
	  };

/**
 * A draft of the ruling's reason for each relation. The author's reasons name
 * each mechanism's lever; these say which kind of difference to name.
 */
export const RELATION_DRAFTS: Record<
	Exclude<JudgeRelation, "same_idea">,
	string
> = {
	cause_effect:
		"Cause and effect: one is a cause or a special case of the other, which is the broader result.",
	before_after:
		"Before and after: one acts before the harm (prevention, refusal), the other after it (undoing, recourse).",
	different_target:
		"Different targets: similar machinery aimed at different things, such as the institution's cover versus a gate on the person.",
	same_family:
		"Same family, different levers: related ideas that work through different levers.",
	unrelated: "Different ideas with little in common.",
};

export const RELATION_LABELS: Record<JudgeRelation, string> = {
	same_idea: "same idea",
	cause_effect: "cause and effect",
	before_after: "before and after",
	different_target: "different targets",
	same_family: "same family",
	unrelated: "unrelated",
};

/** Mean of each vote's same-lever times same-evidence: the author's rule as one number. */
export const judgmentScore = (votes: readonly JudgeVote[]): number =>
	votes.length === 0
		? 0
		: Math.round(
				(votes.reduce(
					(sum, vote) => sum + vote.sameLever * vote.sameEvidence,
					0,
				) /
					votes.length) *
					100,
			) / 100;

/** The relations other than same idea, most votes first (ties in JUDGE_RELATIONS order). */
const otherRelations = (
	votes: readonly JudgeVote[],
): Array<Exclude<JudgeRelation, "same_idea">> => {
	const counts = new Map<Exclude<JudgeRelation, "same_idea">, number>();
	for (const vote of votes) {
		if (vote.relation === "same_idea") continue;
		counts.set(vote.relation, (counts.get(vote.relation) ?? 0) + 1);
	}
	return [...counts.keys()].sort(
		(a, b) =>
			(counts.get(b) ?? 0) - (counts.get(a) ?? 0) ||
			JUDGE_RELATIONS.indexOf(a) - JUDGE_RELATIONS.indexOf(b),
	);
};

/** The call on one pair; null with no votes. */
export const decidePair = (votes: readonly JudgeVote[]): PairCall | null => {
	if (votes.length === 0) return null;
	const score = judgmentScore(votes);
	const sameIdea = votes.filter((vote) => vote.relation === "same_idea").length;
	if (sameIdea === votes.length) {
		return { call: "same-idea", votes: votes.length, score };
	}
	const others = otherRelations(votes);
	if (sameIdea > 0) {
		return { call: "split", votes: votes.length, sameIdea, score, others };
	}
	const relation = others[0];
	return {
		call: "distinct",
		votes: votes.length,
		score,
		relation,
		draft: RELATION_DRAFTS[relation],
	};
};

/** One line for a report, e.g. "judges: same idea 2 of 3, cause and effect 1". */
export const describeCall = (call: PairCall): string => {
	if (call.call === "same-idea") {
		return `judges: same idea, ${call.votes} of ${call.votes} (lever and evidence ${call.score.toFixed(2)})`;
	}
	if (call.call === "split") {
		return `judges split: same idea ${call.sameIdea} of ${call.votes}, otherwise ${call.others.map((relation) => RELATION_LABELS[relation]).join(", ")} (lever and evidence ${call.score.toFixed(2)})`;
	}
	return `judges: not the same idea, ${call.votes} of ${call.votes}; mostly ${RELATION_LABELS[call.relation]} (lever and evidence ${call.score.toFixed(2)})`;
};

/** A ruling the decision table got wrong, or left to the author. */
export type JudgmentEvalMiss = {
	pair: [string, string];
	ruled: "merge" | "distinct";
	call: PairCall;
};

export type JudgmentEval = {
	/** Rulings with recorded votes. */
	scored: number;
	/** Rulings with no votes recorded. */
	unjudged: Array<[string, string]>;
	/** The table: same idea is a merge, distinct is distinct, split is left to the author. */
	table: {
		right: number;
		wrong: JudgmentEvalMiss[];
		left: JudgmentEvalMiss[];
	};
	/**
	 * The score with a cutoff, leave-one-out: each ruling is judged with the
	 * cutoff halfway between the weakest merge and the strongest distinct pair
	 * among the other rulings.
	 */
	scoreCutoff: { right: number; wrong: JudgmentEvalMiss[] };
	/**
	 * Each vote alone, as a table with one judge (same idea: merge; anything
	 * else: distinct), grouped by the command that answered (null: not
	 * recorded). Set beside the table, it says what the extra judges add, and
	 * per command, which model judges best.
	 */
	byCommand: Array<{
		command: string | null;
		votes: number;
		right: number;
		wrong: number;
	}>;
	/** Judged rulings on which every judge chose the same relation. */
	agreed: number;
};

/**
 * Scores the decision table against the author's rulings. `rulings` pairs
 * each ruling with the votes recorded on it (on the texts as ruled: merges as
 * they were before the merge).
 */
export const evaluateJudgments = (
	rulings: ReadonlyArray<{
		pair: [string, string];
		ruled: "merge" | "distinct";
		votes: readonly JudgeVote[];
	}>,
): JudgmentEval => {
	const judged = rulings.filter((ruling) => ruling.votes.length > 0);
	const result: JudgmentEval = {
		scored: judged.length,
		unjudged: rulings
			.filter((ruling) => ruling.votes.length === 0)
			.map((ruling) => ruling.pair),
		table: { right: 0, wrong: [], left: [] },
		scoreCutoff: { right: 0, wrong: [] },
		byCommand: [],
		agreed: 0,
	};
	const commands = new Map<string | null, JudgmentEval["byCommand"][number]>();
	for (const ruling of judged) {
		if (new Set(ruling.votes.map((vote) => vote.relation)).size === 1)
			result.agreed += 1;
		for (const vote of ruling.votes) {
			const command = vote.command ?? null;
			const tally = commands.get(command) ?? {
				command,
				votes: 0,
				right: 0,
				wrong: 0,
			};
			tally.votes += 1;
			if ((vote.relation === "same_idea") === (ruling.ruled === "merge"))
				tally.right += 1;
			else tally.wrong += 1;
			commands.set(command, tally);
		}

		const call = decidePair(ruling.votes) as PairCall;
		const miss = { pair: ruling.pair, ruled: ruling.ruled, call };
		if (call.call === "split") result.table.left.push(miss);
		else if ((call.call === "same-idea") === (ruling.ruled === "merge"))
			result.table.right += 1;
		else result.table.wrong.push(miss);

		const others = judged.filter((other) => other !== ruling);
		const merges = others
			.filter((other) => other.ruled === "merge")
			.map((other) => judgmentScore(other.votes));
		const distinct = others
			.filter((other) => other.ruled === "distinct")
			.map((other) => judgmentScore(other.votes));
		if (merges.length === 0 || distinct.length === 0) continue;
		const cutoff = (Math.min(...merges) + Math.max(...distinct)) / 2;
		const merged = judgmentScore(ruling.votes) > cutoff;
		if (merged === (ruling.ruled === "merge")) result.scoreCutoff.right += 1;
		else result.scoreCutoff.wrong.push(miss);
	}
	result.byCommand = [...commands.values()].sort(
		(a, b) => b.right / b.votes - a.right / a.votes || b.votes - a.votes,
	);
	return result;
};
