import { basename } from "node:path";
import {
	formatFrontmatter,
	parseFrontmatter,
} from "../../packages/astro-bookkit/src/utils/frontmatter";
import { jsonInReply } from "./model-command";

/**
 * `bookkit define`: a mechanism that has a name but no definition (what
 * `propose --apply mechanisms` and `new mechanism` without --definition
 * write) defined by a writer model from the sentences of the book that use
 * it. The writer proposes; overlap with the corpus and the content check
 * decide whether it may be written, and it fills only empty fields.
 */

export type Evidence = { file: string; sentence: string };

export type DefinedFields = {
	definition: string;
	is: string[];
	isNot: string[];
	predictions: string[];
	tests: string[];
};

/** The fields a definition fills, in the order a mechanism file lists them. */
export const DEFINED_FIELDS = [
	"definition",
	"is",
	"isNot",
	"predictions",
	"tests",
] as const;

const SENTENCE = /[^.!?\n]+[.!?]/g;

/**
 * Sentences in the chapters that use the mechanism by its title, or by its
 * slug as words: what the book means by it, in its own words. At most
 * `limit`, spread across chapters before taking a second from any one.
 */
export const evidenceFor = (
	mechanism: { slug: string; title: string },
	bodies: ReadonlyArray<{ file: string; body: string }>,
	limit = 8,
): Evidence[] => {
	const names = [mechanism.title, mechanism.slug.replace(/-/g, " ")]
		.map((name) => name.trim().toLowerCase())
		.filter(Boolean);
	const perChapter = bodies.map(({ file, body }) =>
		(body.match(SENTENCE) ?? [])
			.map((sentence) => sentence.trim())
			.filter((sentence) =>
				names.some((name) => sentence.toLowerCase().includes(name)),
			)
			.map((sentence) => ({ file: basename(file), sentence })),
	);
	const taken: Evidence[] = [];
	for (let round = 0; taken.length < limit; round += 1) {
		const next = perChapter.flatMap((found) =>
			found[round] ? [found[round]] : [],
		);
		if (next.length === 0) break;
		taken.push(...next.slice(0, limit - taken.length));
	}
	return taken;
};

export const definePrompt = (input: {
	bookTitle: string;
	stance?: string;
	mechanism: { slug: string; title: string };
	evidence: readonly Evidence[];
	others: ReadonlyArray<{ slug: string; title: string; definition: string }>;
}): string =>
	`<!-- Written by bun run bookkit define. Give one writer this whole prompt, in a session that sees nothing else. -->
You are defining one mechanism of a nonfiction book: a named idea the book argues with. Everything you need is in this message. Do not open files, run commands, or search the web.

The book is "${input.bookTitle}".${input.stance ? ` It argues: ${input.stance}` : ""}

The mechanism is "${input.mechanism.title}" (\`${input.mechanism.slug}\`). Define it as the book uses it, from the sentences below and nothing else.

## Where the book uses it

${input.evidence.length > 0 ? input.evidence.map(({ file, sentence }) => `- ${file}: ${sentence}`).join("\n") : "The chapters never use it by name. Define it from its title, as narrowly as the title allows."}

## The book's other mechanisms

Yours must be a different idea from each of these. If it is one of them under another name, say so in the definition instead of defining it.

${input.others.length > 0 ? input.others.map((m) => `- ${m.title}: ${m.definition}`).join("\n") : "None yet."}

## Rules

1. definition: one or two sentences naming the lever: what the system does, and who bears the cost.
2. is: two to four observable patterns that count as it.
3. isNot: two to four nearby things it is not, so the boundary can be tested instead of argued.
4. predictions: up to three things you would expect to observe where it is active.
5. tests: up to three checks a reader can run to tell whether it is active.
6. No statistics, studies, quotations, dates, laws, or named people or organisations. Plain, short declarative sentences.

Your final message must be ONLY a JSON object of this form:
{"definition":"…","is":["…"],"isNot":["…"],"predictions":["…"],"tests":["…"]}
No prose before or after the JSON.
`;

const strings = (value: unknown): string[] =>
	Array.isArray(value)
		? value
				.filter((item): item is string => typeof item === "string")
				.map((item) => item.trim())
				.filter(Boolean)
		: [];

/** A writer's reply as the fields it defines, or why it is not one. */
export const readDefinition = (
	text: string,
): DefinedFields | { error: string } => {
	const parsed = jsonInReply(text) as Record<string, unknown> | undefined;
	if (!parsed) return { error: "the reply holds no JSON object" };
	const fields: DefinedFields = {
		definition:
			typeof parsed.definition === "string" ? parsed.definition.trim() : "",
		is: strings(parsed.is),
		isNot: strings(parsed.isNot),
		predictions: strings(parsed.predictions),
		tests: strings(parsed.tests),
	};
	if (!fields.definition) return { error: "the reply has no definition" };
	if (fields.is.length === 0 || fields.isNot.length === 0) {
		return { error: "the reply needs at least one is and one isNot" };
	}
	return fields;
};

const empty = (value: unknown): boolean =>
	value === undefined ||
	value === null ||
	(typeof value === "string" && value.trim() === "") ||
	(Array.isArray(value) && value.length === 0);

/** The mechanism's fields that are still empty, by name. */
export const emptyFields = (source: string): string[] => {
	const parsed = parseFrontmatter(source);
	if (parsed.status !== "ok") return [...DEFINED_FIELDS];
	return DEFINED_FIELDS.filter((field) => empty(parsed.data[field]));
};

/**
 * The mechanism file with `fields` written into the fields that are empty,
 * and every other field and the body as they were. A field the author wrote
 * is never replaced.
 */
export const fillMechanism = (
	source: string,
	fields: DefinedFields,
): { source: string; filled: string[] } => {
	const parsed = parseFrontmatter(source);
	if (parsed.status !== "ok") return { source, filled: [] };
	const data: Record<string, unknown> = { ...parsed.data };
	const filled: string[] = [];
	for (const field of DEFINED_FIELDS) {
		if (!empty(data[field]) || empty(fields[field])) continue;
		data[field] = fields[field];
		filled.push(field);
	}
	return {
		source: `${formatFrontmatter(data)}\n${parsed.body.trim()}\n`,
		filled,
	};
};
