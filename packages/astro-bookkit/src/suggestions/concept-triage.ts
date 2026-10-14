import { normalizeText } from "./tokenize";
import type { ContentSuggestion } from "./types";

/** A sentence that uses a term, so a reader can judge the term in context. */
export type ConceptExample = {
	file: string;
	sentence: string;
};

export type ConceptFlag = {
	/** The term as the prose most often writes it, e.g. "context debt". */
	term: string;
	files: string[];
	occurrences: number;
	/** One sentence using the term, from the file where it first appears. */
	example?: ConceptExample;
};

export type ConceptTriageOptions = {
	book: string;
	/** Terms already registered as mechanisms or glossary entries. */
	vocabulary?: string[];
};

export type ConceptClassification = "register" | "proper-noun" | "review";

export type RecurringTermOptions = {
	/**
	 * Names already registered: mechanism slugs and titles, glossary terms,
	 * tool names. A term matching one (or containing a multi-word one, or
	 * contained in it) is reported under `registered`, not as a candidate.
	 */
	vocabulary?: string[];
	/** Fewest uses across all files for a term to count. Default 2. */
	minOccurrences?: number;
	/** Fewest distinct files a term must appear in. Default 2. */
	minFiles?: number;
};

export type RecurringTermsReport = {
	/** Files with any prose left after code, markup, and headings are removed. */
	filesRead: number;
	wordsRead: number;
	/** Unregistered recurring terms, most widespread first. */
	candidates: ConceptFlag[];
	/** Recurring terms that match a registered name, with the name matched. */
	registered: Array<ConceptFlag & { registeredAs: string }>;
};

/**
 * Words that cannot start or end a term. Function words, plus the common
 * verbs, adverbs, and quantifiers that make phrases like "next time" or
 * "takes practice" recur in any prose without naming anything.
 */
const BOUNDARY_STOPWORDS = new Set(
	`a about above across after again against all almost along also although always am among an and another any anyone anything are around as at away
	back be became because become becomes been before being below between both but by can cannot could did do does doing done down during each either else
	enough even ever every everyone everything few first for from further get gets getting give given gives go goes going gone got had has have having he her
	here hers him his how however i if in into is it its itself just keep keeps kept know knows knew last later least less let lets like likely made make makes
	making many may maybe me might mine more most much must my near need needs never new next no nobody none nor not nothing now of off often on once one only
	onto or other others our ours out over own per perhaps put quite rather really said same say says second see seems seen several shall she should since so
	some someone something sometimes still such take takes taken taking than that the their theirs them themselves then there these they thing things third this
	those though through thus to today together too toward towards under unless until up upon us use used uses using very via was way ways we well were what
	whatever when where whether which while who whom whose why will with within without would yes yet you your yours yourself day days week weeks year years
	time times lot lots kind kinds part parts point points case cases fact example examples sure able`.split(
		/\s+/,
	),
);

/** Function words a term may carry inside it: "cost of delay", "delay as force". */
const INNER_CONNECTORS = new Set([
	"of",
	"as",
	"for",
	"and",
	"to",
	"in",
	"on",
	"by",
	"the",
]);

const MIN_WORDS = 2;
const MAX_WORDS = 4;

/** Plural and possessive forms share a key: "handoffs" and "handoff's" count as "handoff". */
const stemWord = (word: string): string => {
	const base = word.replace(/['’]s$/u, "");
	if (base.length > 4 && base.endsWith("ies")) return `${base.slice(0, -3)}y`;
	if (base.length > 4 && /(?:ss|ch|sh|x|z)es$/u.test(base))
		return base.slice(0, -2);
	if (base.length > 3 && base.endsWith("s") && !/(?:ss|us|is)$/u.test(base))
		return base.slice(0, -1);
	return base;
};

type Token = { surface: string; lower: string };

/** Words of one clause; hyphenated compounds ("on-call") stay one word. */
const wordsOf = (clause: string): Token[] =>
	(clause.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).map((raw) => {
		const surface = raw.replace(/[-'’]+$/u, "");
		return { surface, lower: surface.toLowerCase() };
	});

/** The comparison key of a phrase: lowercase, stemmed, hyphens as spaces. */
const termKey = (words: string[]): string =>
	words
		.flatMap((word) => word.toLowerCase().split("-"))
		.filter(Boolean)
		.map(stemWord)
		.join(" ");

const keyOfName = (name: string): string =>
	termKey(wordsOf(name).map((token) => token.lower));

const isBoundaryWord = (token: Token): boolean =>
	!BOUNDARY_STOPWORDS.has(token.lower) &&
	!/['’](?!s$)/u.test(token.lower) &&
	!/^\d/u.test(token.lower) &&
	token.lower.length >= 2;

/**
 * Prose only: code, comments, markup, link targets, and headings removed
 * (headings repeat chapter titles, which are not concepts). Returns
 * sentences, each with its clauses split at punctuation so a term never
 * spans a comma or a parenthesis.
 */
const proseSentences = (body: string): string[] => {
	const text = body
		.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, "\n")
		.replace(/\{\/\*[\s\S]*?\*\/\}|<!--[\s\S]*?-->/g, " ")
		// A second frontmatter block, as an imported note can carry.
		.replace(/^\s*---\n[\s\S]*?\n---[ \t]*\n/u, "")
		.replace(/^\s{0,3}#{1,6}\s.*$/gmu, "")
		.replace(/^\s*\|?\s*:?-{3,}.*$/gmu, "")
		.replace(/`[^`\n]*`/g, " ")
		.replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/\[\^[^\]]+\]:?/g, " ")
		.replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
		.replace(/<\/?[A-Za-z][^>]*>/g, " ")
		.replace(/https?:\/\/\S+/g, " ");
	const sentences: string[] = [];
	for (const block of text.split(/\n\s*\n/)) {
		// List items, table rows, and quoted lines each stand alone.
		const lines = block
			.split("\n")
			.map((line) =>
				line
					.replace(/^\s*>+\s?/u, "")
					.replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/u, "")
					.replace(/[*_~]+/g, "")
					.trim(),
			)
			.filter(Boolean);
		const isList = block
			.split("\n")
			.some((line) => /^\s*(?:[-*+]|\d+[.)]|\|)\s/u.test(line));
		const paragraphs = isList ? lines : [lines.join(" ")];
		for (const paragraph of paragraphs) {
			for (const cell of paragraph.split("|")) {
				for (const sentence of cell.split(/(?<=[.!?…])["'”’)\]]*\s+/u)) {
					const trimmed = sentence.replace(/\s+/g, " ").trim();
					if (trimmed) sentences.push(trimmed);
				}
			}
		}
	}
	return sentences;
};

const clausesOf = (sentence: string): string[] =>
	sentence.split(/[,;:()[\]{}"“”‘’«»—–…!?./\\→←⇒+=<>]|\s-+>?\s|\s'|'\s/u);

type Tally = {
	occurrences: number;
	files: Set<string>;
	/** How it is written mid-sentence, where case means something. */
	surfaces: Map<string, number>;
	/** How it is written at the start of a sentence, where case says nothing. */
	initialSurfaces: Map<string, number>;
	/** Distinct sentences using it; one sentence repeated is template text. */
	sentences: Set<string>;
	example?: ConceptExample;
	words: number;
};

/** Phrases of 2–4 words inside one clause that start and end on a content word. */
const phrasesOf = (
	tokens: Token[],
): Array<{ start: number; words: Token[] }> => {
	const phrases: Array<{ start: number; words: Token[] }> = [];
	for (let start = 0; start < tokens.length; start += 1) {
		if (!isBoundaryWord(tokens[start])) continue;
		for (let length = MIN_WORDS; length <= MAX_WORDS; length += 1) {
			const end = start + length - 1;
			if (end >= tokens.length) break;
			const words = tokens.slice(start, end + 1);
			const inner = words.slice(1, -1);
			if (
				inner.some(
					(token) =>
						!isBoundaryWord(token) && !INNER_CONNECTORS.has(token.lower),
				)
			) {
				break;
			}
			if (inner.filter((token) => INNER_CONNECTORS.has(token.lower)).length > 1)
				break;
			if (!isBoundaryWord(words[words.length - 1])) continue;
			phrases.push({ start, words });
		}
	}
	return phrases;
};

/** Code-point order, so results do not depend on the machine's locale. */
const compareText = (a: string, b: string): number =>
	a < b ? -1 : a > b ? 1 : 0;

const mostCommon = (counts: Map<string, number>): string =>
	[...counts.entries()].sort(
		(a, b) => b[1] - a[1] || compareText(a[0], b[0]),
	)[0][0];

/** The display form: how the prose writes the term mid-sentence, most often. */
const displayForm = (tally: Tally): string => {
	if (tally.surfaces.size > 0) return mostCommon(tally.surfaces);
	const surface = mostCommon(tally.initialSurfaces);
	// "Context debt" only ever opening a sentence is "context debt".
	return /^\p{Lu}[^\s]*(?:\s[^\p{Lu}\s][^\s]*)+$/u.test(surface)
		? surface.charAt(0).toLowerCase() + surface.slice(1)
		: surface;
};

/** Every form a registered name is written in: as given, without "The", each part of "A (B)". */
const registeredKeys = (vocabulary: string[]): Map<string, string> => {
	const keys = new Map<string, string>();
	for (const name of vocabulary) {
		if (!name) continue;
		const variants = [
			name,
			name.replace(/^the\s+/i, ""),
			name.replace(/\s*\([^)]*\)\s*/g, " "),
			...[...name.matchAll(/\(([^)]+)\)/g)].map((match) => match[1]),
		];
		for (const variant of variants) {
			const key = keyOfName(variant.replace(/^the\s+/i, ""));
			if (key && !keys.has(key)) keys.set(key, name);
		}
	}
	return keys;
};

const containsWords = (outer: string, inner: string): boolean =>
	` ${outer} `.includes(` ${inner} `);

/** The registered name a term refers to, if any. */
const matchRegistered = (
	key: string,
	registered: Map<string, string>,
): string | undefined => {
	const exact = registered.get(key);
	if (exact) return exact;
	for (const [registeredKey, name] of registered) {
		// A one-word name ("handoff") does not claim every phrase using it.
		if (!registeredKey.includes(" ")) continue;
		if (containsWords(key, registeredKey) || containsWords(registeredKey, key))
			return name;
	}
	return undefined;
};

/**
 * Recurring multi-word terms in prose, found regardless of case: every 2–4
 * word phrase that starts and ends on a content word, counted across files
 * with plurals folded together. A term inside a longer one that recurs about
 * as often is dropped in favour of the longer one. Deterministic: the same
 * text always gives the same list in the same order.
 */
export const findRecurringTerms = (
	bodies: Array<{ file: string; body: string }>,
	options: RecurringTermOptions = {},
): RecurringTermsReport => {
	const minOccurrences = options.minOccurrences ?? 2;
	const minFiles = options.minFiles ?? 2;
	const tallies = new Map<string, Tally>();
	let filesRead = 0;
	let wordsRead = 0;

	// File order decides which sentence is the example; fix it by path.
	const ordered = [...bodies].sort((a, b) => compareText(a.file, b.file));
	for (const { file, body } of ordered) {
		const sentences = proseSentences(body);
		let fileWords = 0;
		for (const sentence of sentences) {
			let sentenceStart = true;
			for (const clause of clausesOf(sentence)) {
				const tokens = wordsOf(clause);
				fileWords += tokens.length;
				for (const { start, words } of phrasesOf(tokens)) {
					const key = termKey(words.map((token) => token.lower));
					const surface = words.map((token) => token.surface).join(" ");
					const tally = tallies.get(key) ?? {
						occurrences: 0,
						files: new Set<string>(),
						surfaces: new Map<string, number>(),
						initialSurfaces: new Map<string, number>(),
						sentences: new Set<string>(),
						words: words.length,
					};
					tally.occurrences += 1;
					tally.files.add(file);
					const surfaces =
						sentenceStart && start === 0
							? tally.initialSurfaces
							: tally.surfaces;
					surfaces.set(surface, (surfaces.get(surface) ?? 0) + 1);
					tally.sentences.add(sentence.toLowerCase());
					tally.example ??= {
						file,
						sentence:
							sentence.length > 200 ? `${sentence.slice(0, 197)}…` : sentence,
					};
					tallies.set(key, tally);
				}
				if (tokens.length > 0) sentenceStart = false;
			}
		}
		wordsRead += fileWords;
		if (fileWords > 0) filesRead += 1;
	}

	// A sentence repeated in every file ("Draft chapter, to be written.")
	// is a template, not a term the prose keeps using.
	const recurring = [...tallies.entries()].filter(
		([, tally]) =>
			tally.occurrences >= minOccurrences &&
			tally.files.size >= minFiles &&
			tally.sentences.size >= 2,
	);
	// "decision loop" inside "sticky decision loop": keep the longer name
	// when it accounts for most uses of the shorter one.
	const kept = recurring.filter(
		([key, tally]) =>
			!recurring.some(
				([otherKey, other]) =>
					other.words > tally.words &&
					containsWords(otherKey, key) &&
					other.occurrences >= tally.occurrences * 0.75,
			),
	);

	const registered = registeredKeys(options.vocabulary ?? []);
	const report: RecurringTermsReport = {
		filesRead,
		wordsRead,
		candidates: [],
		registered: [],
	};
	for (const [key, tally] of kept) {
		const flag: ConceptFlag = {
			term: displayForm(tally),
			occurrences: tally.occurrences,
			files: [...tally.files],
			example: tally.example,
		};
		const registeredAs = matchRegistered(key, registered);
		if (registeredAs) report.registered.push({ ...flag, registeredAs });
		else report.candidates.push(flag);
	}
	const byReach = (a: ConceptFlag, b: ConceptFlag) =>
		b.files.length - a.files.length ||
		b.occurrences - a.occurrences ||
		b.term.split(" ").length - a.term.split(" ").length ||
		compareText(a.term, b.term);
	report.candidates.sort(byReach);
	report.registered.sort(byReach);
	return report;
};

/** Unregistered recurring terms, most widespread first (see `findRecurringTerms`). */
export const extractConceptFlags = (
	bodies: Array<{ file: string; body: string }>,
	options: RecurringTermOptions = {},
): ConceptFlag[] => findRecurringTerms(bodies, options).candidates;

const PROPER_NOUN_SUFFIXES = [
	"inc",
	"ltd",
	"llc",
	"corp",
	"corporation",
	"university",
	"institute",
	"college",
	"school",
	"council",
	"department",
	"administration",
	"company",
	"hospital",
	"clinic",
	"center",
	"act",
	"commission",
	"agency",
	"association",
	"foundation",
	"department of",
	"bank",
	"federal",
	"national",
	"international",
];

const isLikelyProperNoun = (term: string): boolean => {
	const words = normalizeText(term).split(" ");
	const first = words[0];
	const last = words[words.length - 1];
	return (
		PROPER_NOUN_SUFFIXES.some(
			(suffix) => suffix === first || suffix === last,
		) || /\d/.test(term)
	);
};

export const classifyConcept = (
	flag: ConceptFlag,
): { classification: ConceptClassification; reason: string } => {
	if (isLikelyProperNoun(flag.term)) {
		return { classification: "proper-noun", reason: "proper-noun signals" };
	}
	if (flag.occurrences >= 3 && flag.files.length >= 2) {
		return {
			classification: "register",
			reason: `${flag.occurrences} uses across ${flag.files.length} files`,
		};
	}
	return {
		classification: "review",
		reason: `${flag.occurrences} uses across ${flag.files.length} files, below the 3 that suggest registering`,
	};
};

/** `in chapters/02-shift.mdx: "Context debt piles up…"`, for messages. */
export const describeExample = (
	example: ConceptExample | undefined,
	relativeTo?: string,
): string => {
	if (!example) return "";
	const file =
		relativeTo && example.file.startsWith(`${relativeTo}/`)
			? example.file.slice(relativeTo.length + 1)
			: example.file;
	return `${file}: "${example.sentence}"`;
};

/**
 * One suggestion per unregistered recurring term. Terms matching the
 * vocabulary are dropped here as well, for callers that pass flags extracted
 * without it.
 */
export const triageConcepts = (
	flags: ConceptFlag[],
	options: ConceptTriageOptions,
): ContentSuggestion[] => {
	const registered = registeredKeys(options.vocabulary ?? []);

	return flags
		.filter((flag) => !matchRegistered(keyOfName(flag.term), registered))
		.map((flag) => {
			const { classification, reason } = classifyConcept(flag);
			const severity = classification === "register" ? "advisory" : "info";
			const message =
				classification === "register"
					? `"${flag.term}" recurs ${flag.occurrences} times across ${flag.files.length} files and is not registered.`
					: `"${flag.term}" classified as ${classification} (${reason}).`;

			return {
				category: "concept-triage",
				severity,
				book: options.book,
				file: flag.example?.file ?? flag.files[0],
				message,
				nextAction:
					classification === "register"
						? "If the book names an idea with it, register it as a mechanism or glossary term (bun run bookkit propose drafts one). If it is ordinary wording, leave it."
						: classification === "review"
							? "Review whether this phrase is a named concept the book should govern."
							: "No action required; this is likely a name, not a governed concept.",
				evidence: {
					term: flag.term,
					occurrences: flag.occurrences,
					files: flag.files,
					example: flag.example,
					classification,
				},
			};
		});
};
