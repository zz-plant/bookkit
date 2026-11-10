import { DRAFT_RULES } from "./draft-brief";

/**
 * `bookkit draft`, second half: what a judge is asked about the candidates
 * that compiled, and how the ballots become a call.
 *
 * A judge is a decision model, or a person, given the brief the writers got
 * and the candidates under neutral ids, in an order of its own. It ranks
 * them and may reject any that break the brief's rules. The call comes from
 * a table over the ballots, as `check:corpus` decides a pair from its judges'
 * votes, and not from a score:
 *
 *   - a draft most judges reject is out;
 *   - of the rest, the one most judges rank above each other draft wins;
 *   - when no draft beats every other, the judges split and the choice is
 *     the author's;
 *   - when every draft is out, there is no winner.
 */

export type Ballot = {
	/** Every draft's id, best first. */
	ranking: string[];
	/** Drafts that should not be used, each with the judge's reason. */
	reject: Array<{ id: string; why: string }>;
	/** Why the first beats the second, in the judge's words. */
	why: string;
};

/** The judge's prompt: the brief, the candidates, and the form of the ballot. */
export const judgeDraftsPrompt = (
	brief: string,
	drafts: ReadonlyArray<{ id: string; source: string }>,
): string =>
	`<!-- Written by bun run bookkit draft. Give one judge this whole prompt, in a session that sees nothing else. -->
You are a blind judge. Everything you need is in this message.

Do not open, list, or search any file or directory, do not run commands, do not search the web, and do not look at any repository. Judge only from this message.

Several writers were each given the brief below and asked to draft one chapter of a nonfiction book from its stub. Their ${drafts.length} draft${drafts.length === 1 ? "" : "s"} follow${drafts.length === 1 ? "s" : ""} the brief, under neutral ids. You do not know who wrote which. The author will publish at most one, under their own name.

Judge each draft against the rules the writers were given:

${DRAFT_RULES.map((rule, index) => `${index + 1}. ${rule}`).join("\n")}

Then give:
- ranking: every draft id, best first. The best is the one the author would have to change least before putting their name to it.
- reject: the drafts that should not be used at all, each with one sentence saying which rule it breaks and where. Reject a draft that argues something the stub does not claim, redefines or renames a mechanism, coins a concept, or states a fact the brief does not supply. Decide each rejection as if that draft were the only one: a draft is not usable because the others are worse. An empty list is a fine answer; so is rejecting every draft.
- why: one sentence on why your first choice beats your second.

Be strict, not polite. Length is not quality: do not prefer a draft for being longer.

Your final message must be ONLY a JSON object of this form, with draft ids in place of the words in angle brackets:
{"ranking":["<best>","<next>"],"reject":[{"id":"<a rejected draft>","why":"States a statistic the brief does not supply, in its second section."}],"why":"<best> covers every planned section; <next> skips the last."}
No prose before or after the JSON.

# The brief the writers got

${brief.trim()}

# The drafts

${drafts.map(({ id, source }) => `## Draft ${id}\n\n${source.trim()}`).join("\n\n")}
`;

/**
 * A judge's reply as a ballot over `ids`, or why it is not one. The reply may
 * carry prose around the JSON object; the object is taken.
 */
export const readBallot = (
	text: string,
	ids: readonly string[],
): Ballot | { error: string } => {
	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");
	let parsed: { ranking?: unknown; reject?: unknown; why?: unknown };
	try {
		parsed = JSON.parse(text.slice(start, end + 1));
		if (typeof parsed !== "object" || parsed === null) throw new Error();
	} catch {
		return { error: "the reply holds no JSON object" };
	}
	const ranking = Array.isArray(parsed.ranking)
		? parsed.ranking.map(String)
		: [];
	const missing = ids.filter((id) => !ranking.includes(id));
	const unknown = ranking.filter((id) => !ids.includes(id));
	if (
		missing.length > 0 ||
		unknown.length > 0 ||
		new Set(ranking).size !== ranking.length
	) {
		return {
			error: `ranking must list each of ${ids.join(", ")} once${missing.length > 0 ? `; missing ${missing.join(", ")}` : ""}${unknown.length > 0 ? `; ${unknown.join(", ")} is not a draft` : ""}`,
		};
	}
	const reject: Ballot["reject"] = [];
	for (const item of Array.isArray(parsed.reject) ? parsed.reject : []) {
		const entry: { id?: unknown; why?: unknown } =
			typeof item === "object" && item !== null ? item : { id: item };
		const id = String(entry.id);
		if (!ids.includes(id)) {
			return { error: `reject names ${id}, which is not a draft` };
		}
		reject.push({ id, why: typeof entry.why === "string" ? entry.why : "" });
	}
	return {
		ranking,
		reject,
		why: typeof parsed.why === "string" ? parsed.why : "",
	};
};

export type DraftCall =
	| {
			call: "winner";
			winner: string;
			/** Judges who ranked it first of the drafts left standing. */
			firsts: number;
			judges: number;
	  }
	| {
			call: "split";
			/** The drafts left standing, most preferred first. */
			order: string[];
			judges: number;
	  }
	| { call: "none"; judges: number };

export type DraftDecision = DraftCall & {
	/** Drafts most judges rejected, with how many did and their reasons. */
	rejected: Array<{ id: string; by: number; reasons: string[] }>;
};

/** The call on a set of drafts, from the judges' ballots (see the table above). */
export const decideDrafts = (
	ids: readonly string[],
	ballots: readonly Ballot[],
): DraftDecision => {
	const judges = ballots.length;
	const rejections = ids.map((id) => {
		const reasons = ballots.flatMap((ballot) =>
			ballot.reject.filter((entry) => entry.id === id).map(({ why }) => why),
		);
		return { id, by: reasons.length, reasons: reasons.filter(Boolean) };
	});
	const rejected = rejections.filter(({ by }) => by * 2 > judges);
	const standing = ids.filter((id) => !rejected.some((out) => out.id === id));
	if (judges === 0 || standing.length === 0) {
		return { call: "none", judges, rejected };
	}
	/** Judges who rank `a` above `b`. */
	const prefer = (a: string, b: string) =>
		ballots.filter(
			(ballot) => ballot.ranking.indexOf(a) < ballot.ranking.indexOf(b),
		).length;
	const winner = standing.find((id) =>
		standing.every(
			(other) => other === id || prefer(id, other) > prefer(other, id),
		),
	);
	if (winner) {
		const firsts = ballots.filter(
			(ballot) => ballot.ranking.find((id) => standing.includes(id)) === winner,
		).length;
		return { call: "winner", winner, firsts, judges, rejected };
	}
	// No draft beats every other: order them by how many pairings each wins.
	const wins = (id: string) =>
		standing.reduce(
			(sum, other) => sum + (other === id ? 0 : prefer(id, other)),
			0,
		);
	return {
		call: "split",
		order: [...standing].sort((a, b) => wins(b) - wins(a)),
		judges,
		rejected,
	};
};
