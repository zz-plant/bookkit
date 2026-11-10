import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { extractPageFacts } from "../../packages/astro-bookkit/src/markdown/pageFacts";
import { isReleasedStatus } from "../../packages/astro-bookkit/src/schemas/status";
import {
	DEFAULT_MIN_INDEXABLE_WORDS,
	isThinPage,
} from "../../packages/astro-bookkit/src/seo/page-meta";
import {
	formatFrontmatter,
	parseFrontmatter,
} from "../../packages/astro-bookkit/src/utils/frontmatter";
import {
	readBookFrame,
	readBookSources,
	readBookStatus,
	readRetiredSlugs,
	routeSlugsOf,
} from "../../packages/astro-bookkit/src/validators/book-validator";
import {
	checkContentItem,
	mechanismSlugsFrom,
} from "../../packages/astro-bookkit/src/validators/content-check";
import { repoRoot } from "../_lib";
import { loadBookConfig } from "./authoring";
import { compileFinding, compileMdx } from "./compile-mdx";
import { loadBookContent } from "./load-book";

/**
 * `bookkit draft`, first half: what a writer is told, and what its reply has
 * to pass before a judge sees it.
 *
 * A writer is any model given the brief: the stub, the mechanisms the book
 * defines, a drafted chapter for length and voice, and the author's notes.
 * Its reply becomes a candidate: the stub's frontmatter with the reply's
 * body, `mechanisms:` and `summary:`. Nothing else in the frontmatter is the
 * writer's to change, so a draft cannot move a chapter in the reading order,
 * rename it, or publish it.
 *
 * The gate is the compiler: the checks `bookkit check <file>` runs on a
 * chapter, plus two a draft answers for. It must be past the stub threshold,
 * and it may bind only mechanisms the book defines. A candidate with an error
 * is out before any judge is asked.
 */

type Mechanism = {
	slug: string;
	title: string;
	definition: string;
	is: string[];
	isNot: string[];
	tests: string[];
};

export type DraftBriefInput = {
	bookTitle: string;
	/** What the book argues (`causalStance` in book.config.ts). */
	stance?: string;
	/** Who it is for (`objectives.readerStart` and `readerEnd`). */
	reader?: { start?: string; end?: string };
	/** The stub's whole file. */
	stub: string;
	/** Chapter titles in reading order, and which one is being drafted. */
	outline: Array<{ title: string; current: boolean }>;
	/** Mechanisms the stub binds, with their contracts. */
	bound: Mechanism[];
	/** The book's other mechanisms: slug, title, definition. */
	others: Array<Pick<Mechanism, "slug" | "title" | "definition">>;
	glossary: string[];
	/** A drafted chapter of the book, for length and voice. */
	sample?: { title: string; body: string };
	/** The author's own source text for the chapter. */
	notes: Array<{ name: string; text: string }>;
	targetWords: number;
	minimumWords: number;
};

const list = (label: string, items: string[]): string =>
	items.length > 0
		? `${label}:\n${items.map((item) => `- ${item}`).join("\n")}\n`
		: "";

const contract = (mechanism: Mechanism): string =>
	`### ${mechanism.title} (\`${mechanism.slug}\`)\n\nDefinition: ${mechanism.definition}\n${list("It is", mechanism.is)}${list("It is not", mechanism.isNot)}${list("Tests", mechanism.tests)}`;

/** The rules a draft is written to, and judged by (draft-ballots.ts). */
export const DRAFT_RULES = [
	"It keeps the stub's claim as stated, argues that claim and nothing else, and turns each planned section or bullet of the stub into prose under its own heading, in the stub's order, with no section the stub does not plan.",
	"It uses the book's mechanisms by their titles and as defined. It does not rename one, redefine one, or name a new concept of its own.",
	'It states no fact the brief does not supply: no statistics, studies, quotations, dates, laws, or named people and organisations of the writer\'s own. An example is generic and replaceable ("a tenant waiting on a repair"), never a real event.',
	"It reads as the book does: short declarative sentences, and checks or lists a reader can act on. No filler, no summary of what it is about to say.",
] as const;

/** The writer's prompt: the whole brief, for one model that sees nothing else. */
export const draftBrief = (input: DraftBriefInput): string => {
	const reader = [
		input.reader?.start
			? `Its reader, at the start: ${input.reader.start}`
			: "",
		input.reader?.end ? `Its reader, at the end: ${input.reader.end}` : "",
	]
		.filter(Boolean)
		.map((line) => `${line}\n`)
		.join("");
	const outline = input.outline
		.map(
			({ title, current }, index) =>
				`${current ? "→" : " "} ${index + 1}. ${title}`,
		)
		.join("\n");
	const sections = [
		`<!-- Written by bun run bookkit draft. Give one writer this whole brief, in a session that sees nothing else. -->
You are drafting one chapter of a nonfiction book from its stub. Everything you need is in this message. Do not open files, run commands, or search the web.

Your reply must be ONLY the chapter file: the frontmatter block between --- lines, then the chapter in Markdown. No prose before or after it, and no code fence around it.`,
		`## The book

Title: ${input.bookTitle}
${input.stance ? `What it argues: ${input.stance}\n` : ""}${reader}
Chapters, in reading order (→ marks the one you are drafting):

${outline}`,
		`## The stub to draft

<stub>
${input.stub.trim()}
</stub>`,
		`## Rules

A draft is judged against these, and one that breaks them is rejected.

${DRAFT_RULES.map((rule, index) => `${index + 1}. ${rule}`).join("\n")}
${DRAFT_RULES.length + 1}. About ${input.targetWords} words of prose${input.minimumWords > 0 ? `, and at least ${input.minimumWords}` : ""}. A rough length is enough: do not count the words.
${DRAFT_RULES.length + 2}. Keep the frontmatter's slug, title, status, and prerequisites as they are. Under \`mechanisms:\`, list the slug of each mechanism the chapter relies on, and only slugs from this brief. You may add a one-sentence \`summary:\`.
${DRAFT_RULES.length + 3}. Markdown only: \`##\` headings, paragraphs, lists, **bold**. No HTML, no comments, no JSX, no images, no links, no curly braces.`,
		input.bound.length > 0
			? `## Mechanisms this chapter binds\n\n${input.bound.map(contract).join("\n")}`
			: "",
		input.others.length > 0
			? `## The book's other mechanisms\n\nBind one by its slug if the chapter relies on it.\n\n${input.others.map((m) => `- \`${m.slug}\` — ${m.title}: ${m.definition}`).join("\n")}`
			: "",
		input.glossary.length > 0
			? `## Terms the book already defines\n\n${input.glossary.join(", ")}`
			: "",
		input.notes.length > 0
			? `## The author's notes for this chapter\n\nThese are the author's own words. Draw on them before anything else; facts stated here are supplied.\n\n${input.notes.map(({ name, text }) => `<notes file="${name}">\n${text.trim()}\n</notes>`).join("\n\n")}`
			: "",
		input.sample
			? `## A drafted chapter of the book, for length and voice only: "${input.sample.title}"\n\nIt argues another chapter's claim. Do not reuse its headings, lists, or sentences.\n\n<sample>\n${input.sample.body.trim()}\n</sample>`
			: "",
	];
	return `${sections.filter(Boolean).join("\n\n")}\n`;
};

const median = (values: number[]): number | undefined => {
	if (values.length === 0) return undefined;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)];
};

/** Length to aim for when the book has no drafted chapter to go by. */
const DEFAULT_TARGET_WORDS = 300;

/** Text files in a notes path: the file, or a folder's .md, .mdx, and .txt. */
export const readNotes = (
	paths: readonly string[],
): Array<{ name: string; text: string }> | { error: string } => {
	const notes: Array<{ name: string; text: string }> = [];
	for (const path of paths) {
		if (!existsSync(path)) return { error: `No such notes path: ${path}` };
		const files = statSync(path).isDirectory()
			? readdirSync(path)
					.filter((name) => /\.(?:mdx?|txt)$/.test(name))
					.sort()
					.map((name) => join(path, name))
			: [path];
		if (files.length === 0) {
			return { error: `No .md, .mdx, or .txt file in ${path}` };
		}
		for (const file of files) {
			notes.push({ name: basename(file), text: readFileSync(file, "utf8") });
		}
	}
	return notes;
};

export type ChapterToDraft = {
	book: string;
	/** Absolute path of the chapter file. */
	file: string;
	slug: string;
	title: string;
	words: number;
	minimumWords: number;
	stub: boolean;
};

/**
 * The chapter the book's frame is checked in (frame-rules.ts). Its headings
 * are the frame's steps, a rule about the whole book that the check of one
 * file does not apply, so it is not drafted and not used as a sample.
 */
export const isFramingChapter = (file: string): boolean =>
	basename(file) === "00-overview.mdx";

/** A book's chapters in reading order, each with its words against the stub threshold. */
export const chaptersToDraft = async (
	book: string,
): Promise<ChapterToDraft[]> => {
	const config = await loadBookConfig(book);
	const site = config?.site as { minIndexableWords?: number } | undefined;
	const minimumWords = site?.minIndexableWords ?? DEFAULT_MIN_INDEXABLE_WORDS;
	return loadBookContent(book)
		.chapters.flatMap((chapter) => {
			if (!chapter.file) return [];
			const words = extractPageFacts(
				readFileSync(chapter.file, "utf8"),
			).wordCount;
			return [
				{
					book,
					file: chapter.file,
					slug: chapter.slug,
					title: chapter.title,
					words,
					minimumWords,
					stub: isThinPage(words, site),
				},
			];
		})
		.sort((a, b) =>
			basename(a.file).localeCompare(basename(b.file), undefined, {
				numeric: true,
			}),
		);
};

/**
 * The brief for one chapter of a book, from the book as it stands: its
 * config, mechanisms, glossary, and the drafted chapter nearest the stub in
 * reading order. `targetWords` defaults to the median length of the book's
 * drafted chapters, so a draft is the size the book already is.
 */
export const briefInputFor = async (
	chapter: ChapterToDraft,
	options: {
		notes?: Array<{ name: string; text: string }>;
		targetWords?: number;
		/**
		 * The book's chapters as they stood when the run began (default: as
		 * they stand now). A run over several stubs passes them, so a draft it
		 * has just applied is not the next brief's sample of the book's voice.
		 */
		chapters?: ChapterToDraft[];
	} = {},
): Promise<DraftBriefInput> => {
	const config = (await loadBookConfig(chapter.book)) ?? {};
	const objectives = config.objectives as
		| { readerStart?: string; readerEnd?: string }
		| undefined;
	const content = loadBookContent(chapter.book);
	const chapters = options.chapters ?? (await chaptersToDraft(chapter.book));
	const stub = readFileSync(chapter.file, "utf8");
	const parsed = parseFrontmatter(stub);
	const listed =
		parsed.status === "ok" && Array.isArray(parsed.data.mechanisms)
			? parsed.data.mechanisms.filter(
					(slug): slug is string => typeof slug === "string",
				)
			: [];
	const index = chapters.findIndex((other) => other.file === chapter.file);
	// The nearest drafted chapter, the one before first: it is what a reader
	// has just read. The framing chapter walks the frame's steps, which is
	// not how a chapter reads.
	const drafted = chapters
		.map((other, position) => ({ other, distance: position - index }))
		.filter(
			({ other, distance }) =>
				distance !== 0 && !other.stub && !isFramingChapter(other.file),
		)
		.sort(
			(a, b) =>
				Math.abs(a.distance) - Math.abs(b.distance) || a.distance - b.distance,
		);
	const sample = drafted[0]?.other;
	const typical = median(drafted.map(({ other }) => other.words));
	return {
		bookTitle: typeof config.title === "string" ? config.title : chapter.book,
		stance:
			typeof config.causalStance === "string" ? config.causalStance : undefined,
		reader: { start: objectives?.readerStart, end: objectives?.readerEnd },
		stub,
		outline: chapters.map((other) => ({
			title: other.title,
			current: other.file === chapter.file,
		})),
		bound: content.mechanisms.filter((m) => listed.includes(m.slug)),
		others: content.mechanisms
			.filter((m) => !listed.includes(m.slug))
			.map(({ slug, title, definition }) => ({ slug, title, definition })),
		// A mechanism's own glossary entry adds nothing to the lists above it.
		glossary: content.glossaryTerms.filter(
			(term) =>
				term &&
				!content.mechanisms.some(
					(m) => m.title.toLowerCase() === term.toLowerCase(),
				),
		),
		sample: sample
			? {
					title: sample.title,
					body: parseFrontmatter(readFileSync(sample.file, "utf8")).body,
				}
			: undefined,
		notes: options.notes ?? [],
		// To the nearest ten: a writer given 153 counts to 153.
		targetWords:
			options.targetWords ??
			Math.round(
				Math.max(2 * chapter.minimumWords, typical ?? DEFAULT_TARGET_WORDS) /
					10,
			) * 10,
		minimumWords: chapter.minimumWords,
	};
};

/**
 * The chapter file in a writer's reply. Models think aloud before a file
 * (and quote the stub while they do), wrap it in a code fence, or sign off
 * after it. The file is the last frontmatter block that has a slug, to the
 * end of the reply or of the fence around it. A reply with no such block is
 * taken as the body.
 */
export const extractDraft = (reply: string): string => {
	const text = reply
		.replace(/\r\n/g, "\n")
		.replace(/<think>[\s\S]*?<\/think>/g, "")
		// What `ollama run` prints for a model that thinks.
		.replace(/^Thinking\.\.\.\n[\s\S]*?\n\.\.\.done thinking\.\n/, "");
	const starts = [...text.matchAll(/^---[ \t]*\n(?=(?:(?!---).*\n)*?slug:)/gm)];
	const start = starts.at(-1)?.index;
	if (start === undefined) return `${text.trim()}\n`;
	const fenced = /```[a-z]*\n$/.test(text.slice(0, start));
	const rest = text.slice(start);
	const end = fenced ? rest.search(/^```[ \t]*$/m) : -1;
	return `${(end >= 0 ? rest.slice(0, end) : rest).trim()}\n`;
};

/**
 * A candidate: the stub's frontmatter, with the draft's `mechanisms:` and
 * `summary:` when it gives them, and the draft's body. A draft that lists no
 * mechanism keeps its empty list, so a candidate read back as a draft gives
 * the same file.
 */
export const candidateSource = (stub: string, draft: string): string => {
	const base = parseFrontmatter(stub);
	const written = parseFrontmatter(draft);
	const data: Record<string, unknown> =
		base.status === "ok" ? { ...base.data } : {};
	if (written.status === "ok") {
		if (Array.isArray(written.data.mechanisms)) {
			data.mechanisms = written.data.mechanisms;
		}
		if (
			typeof written.data.summary === "string" &&
			written.data.summary.trim()
		) {
			data.summary = written.data.summary.trim();
		}
	}
	const body = written.status === "ok" ? written.body : draft;
	return `${formatFrontmatter(data)}\n${body.trim()}\n`;
};

export type GateFinding = {
	level: "error" | "warning";
	code: string;
	message: string;
	fix?: string;
};

export type GateResult = {
	/** No error: judges may see it. */
	ok: boolean;
	words: number;
	/** The mechanisms it binds. */
	binds: string[];
	findings: GateFinding[];
};

/**
 * Checks a candidate as the chapter it would replace, without writing it:
 * the checks `bookkit check <file>` runs, and that it is no longer a stub.
 */
export const gateCandidate = async (
	book: string,
	source: string,
	minimumWords: number,
): Promise<GateResult> => {
	const root = repoRoot();
	const sources = readBookSources(root, book);
	const mechanismSlugs = mechanismSlugsFrom(
		sources.mechanism.map((mechanism) => mechanism.source),
	);
	const result = checkContentItem("chapter", source, {
		mechanismSlugs,
		slugs: routeSlugsOf(sources),
		retiredSlugs: readRetiredSlugs(root),
		releaseMode: isReleasedStatus(readBookStatus(root, book)),
		frame: readBookFrame(root, book),
	});
	const findings: GateFinding[] = result.findings.map(
		({ level, code, message, fix }) => ({ level, code, message, fix }),
	);
	if (!findings.some((finding) => finding.code === "MDX_HTML_COMMENT")) {
		const compiled = compileFinding(
			await compileMdx(source, join(root, "apps", book)),
		);
		if (compiled) findings.push(compiled);
	}
	const words = extractPageFacts(source).wordCount;
	if (minimumWords > 0 && words < minimumWords) {
		findings.push({
			level: "error",
			code: "DRAFT_STILL_STUB",
			message: `${words} words of prose; a chapter is a stub until ${minimumWords}`,
			fix: "Write the sections the stub plans, as prose.",
		});
	}
	const listed = result.frontmatter?.mechanisms;
	return {
		ok: !findings.some((finding) => finding.level === "error"),
		words,
		binds: Array.isArray(listed)
			? listed.filter((slug): slug is string => typeof slug === "string")
			: [],
		findings,
	};
};
