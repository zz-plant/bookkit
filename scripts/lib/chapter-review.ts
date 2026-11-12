import {
	DRAFT_RULES,
	type DraftBriefInput,
	mechanismContract,
} from "./draft-brief";
import { jsonInReply } from "./model-command";

/**
 * `bookkit review`: a written chapter read by judge models against the rules
 * a draft is held to, and against the contracts of the mechanisms it binds.
 * `bookkit draft` judges candidates against each other; a chapter the author
 * wrote, or edited after a draft, has nothing to be ranked against, so a
 * reviewer says only what it would change and why. Findings are advice: the
 * compiler's checks are what fail a chapter, and review never edits it.
 */

/**
 * The rules a chapter is read against: a draft's rules, with the first
 * rewritten for a chapter that no longer has a stub's plan.
 */
export const REVIEW_RULES = [
	"It argues the claim under its `## Claim` heading (or, without one, the claim its first section makes) and nothing else.",
	...DRAFT_RULES.slice(1),
] as const;

export type ReviewFinding = {
	/** The rule it breaks, from 1; 0 for a mechanism's contract (is, is not, tests). */
	rule: number;
	/** The heading or sentence it is in. */
	where: string;
	what: string;
	fix: string;
};

/** One reviewer's prompt: the book, the chapter, and the contracts it binds. */
export const reviewPrompt = (input: DraftBriefInput): string =>
	`<!-- Written by bun run bookkit review. Give one reviewer this whole prompt, in a session that sees nothing else. -->
You are a blind reviewer. Everything you need is in this message.

Do not open, list, or search any file or directory, do not run commands, do not search the web, and do not look at any repository. Review only from this message.

Below is one chapter of a nonfiction book, as its author means to publish it, and the contract of each mechanism (a named idea the book defines) the chapter binds. Say what the author should change before putting their name to it, and nothing else. Do not praise, summarise, or rewrite the chapter.

## The book

Title: ${input.bookTitle}
${input.stance ? `What it argues: ${input.stance}\n` : ""}
## The rules a chapter is held to

${REVIEW_RULES.map((rule, index) => `${index + 1}. ${rule}`).join("\n")}

A chapter must also use each mechanism it binds as its contract says: what it is, what it is not, and its tests. A breach of a contract is rule 0.

${input.bound.length > 0 ? `## Mechanisms this chapter binds\n\n${input.bound.map(mechanismContract).join("\n")}` : "## Mechanisms this chapter binds\n\nNone."}
${input.others.length > 0 ? `\n## The book's other mechanisms\n\nA chapter that leans on one of these by name without binding it breaks rule 2.\n\n${input.others.map((m) => `- \`${m.slug}\` — ${m.title}: ${m.definition}`).join("\n")}\n` : ""}${input.glossary.length > 0 ? `\n## Terms the book already defines\n\n${input.glossary.join(", ")}\n` : ""}
## The chapter

<chapter>
${input.stub.trim()}
</chapter>

Your final message must be ONLY a JSON object of this form:
{"findings":[{"rule":2,"where":"## Who is shielded","what":"Calls the crumple zone \\"the intended design\\", which its contract does not say.","fix":"Say the strain lands on people, not that anyone designed it to."}]}
Each finding names one rule it breaks (0 for a mechanism's contract), where in the chapter, what is wrong in one sentence, and the change that would fix it in one sentence. An empty list is a fine answer. No prose before or after the JSON.
`;

/** A reviewer's reply as findings, or why it is not one. Prose around the JSON is ignored. */
export const readReview = (
	text: string,
): { findings: ReviewFinding[] } | { error: string } => {
	const parsed = jsonInReply(text) as { findings?: unknown } | undefined;
	if (!parsed) return { error: "the reply holds no JSON object" };
	if (!Array.isArray(parsed.findings)) {
		return { error: "the reply has no findings list" };
	}
	const findings: ReviewFinding[] = [];
	for (const item of parsed.findings) {
		if (typeof item !== "object" || item === null) continue;
		const entry = item as Record<string, unknown>;
		const what = typeof entry.what === "string" ? entry.what.trim() : "";
		if (!what) continue;
		const rule = Number(entry.rule);
		findings.push({
			rule:
				Number.isInteger(rule) && rule >= 0 && rule <= REVIEW_RULES.length
					? rule
					: 0,
			where: typeof entry.where === "string" ? entry.where.trim() : "",
			what,
			fix: typeof entry.fix === "string" ? entry.fix.trim() : "",
		});
	}
	return { findings };
};

/** A rule's short name, for a finding's line. */
export const ruleName = (rule: number): string =>
	rule === 0
		? "a mechanism's contract"
		: (["the claim", "mechanisms", "facts", "voice"][rule - 1] ??
			`rule ${rule}`);
