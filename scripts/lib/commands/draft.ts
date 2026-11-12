import { readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { countWords } from "../../../packages/astro-bookkit/src/markdown/pageFacts";
import { repoRoot } from "../../_lib";
import { chapterNamed } from "../chapter-moves";
import { didYouMean, flagValue, positionals } from "../cli";
import {
	briefInputFor,
	type ChapterToDraft,
	chaptersToDraft,
	draftBrief,
	isFramingChapter,
	readNotes,
} from "../draft-brief";
import {
	type Asked,
	applyCandidate,
	type DraftRequest,
	type DraftResult,
	decideRequest,
	draftingDir,
	gateCandidates,
	missingBallots,
	missingCandidates,
	readRequest,
	readResult,
	requestFolders,
	revisionNotes,
	runDraftJudges,
	runWriters,
	startRequest,
	startRevision,
	tallyResults,
	WRITER_COMMAND_ENV,
	writeJudgeRequest,
} from "../draft-run";
import { resolveFromCaller } from "../folder-report";
import { JUDGE_COMMAND_ENV } from "../judge-runner";
import { commandsFrom, freshPath } from "../model-command";
import { books, takeBook } from "./context";

/**
 * `bookkit draft`: a stub chapter drafted by writer models, checked by the
 * compiler, and chosen by judge models. Writers are meant to be cheap and
 * fast, since most of their drafts are thrown away; judges are meant to be
 * the models whose judgment the author trusts, since they read every draft
 * and write none. Nothing reaches the chapter until `draft apply`.
 */

const VALUED = [
	"--candidates",
	"--judges",
	"--writer",
	"--judge",
	"--notes",
	"--words",
	"--pick",
	"--parallel",
	"--timeout",
];

/** Seconds a writer gets by default: a draft is short, and a model that loops is not waited out. */
const WRITER_TIMEOUT_SECONDS = 300;

const USAGE =
	'bun run bookkit draft [book] <chapter> [--candidates <n>] [--judges <n>] [--writer "<command>"] [--judge "<command>"] [--notes <path>] [--apply]';

export type Commands = {
	writers: string[];
	judges: string[];
	apply: boolean;
	/** Writers asked at once. */
	parallel: number;
	/** Seconds one writer may take. */
	timeoutSeconds: number;
};

/** A whole number of at least 1 from a flag, else its default; undefined (and said) when it is neither. */
const count = (
	rest: string[],
	flag: string,
	fallback: number,
): number | undefined => {
	if (!rest.includes(flag)) return fallback;
	const value = Number(flagValue(rest, flag));
	if (Number.isInteger(value) && value >= 1) return value;
	console.error(`${flag} needs a whole number of 1 or more.`);
	return undefined;
};

const commandsOf = (rest: string[]): Commands | undefined => {
	const run = !rest.includes("--no-run");
	const parallel = count(rest, "--parallel", 1);
	const timeoutSeconds = count(rest, "--timeout", WRITER_TIMEOUT_SECONDS);
	if (parallel === undefined || timeoutSeconds === undefined) return undefined;
	return {
		writers: run ? commandsFrom(rest, "--writer", WRITER_COMMAND_ENV) : [],
		judges: run ? commandsFrom(rest, "--judge", JUDGE_COMMAND_ENV) : [],
		apply: rest.includes("--apply"),
		parallel,
		timeoutSeconds,
	};
};

const shown = (path: string): string => relative(process.cwd(), path) || ".";

const printAsked = (role: string, several: boolean) => (asked: Asked) => {
	const who = several ? `${asked.command}, ` : "";
	console.log(
		asked.error
			? `  ✗ ${role} ${asked.n} (${who}${asked.seconds}s): ${asked.error}`
			: `  ✓ ${role} ${asked.n} (${who}${asked.seconds}s)`,
	);
};

const asking = (
	role: string,
	total: number,
	how: string,
	commands: string[],
): string =>
	commands.length === 1
		? `\nAsking ${total} ${role}(s), ${how}, with: ${commands[0]}`
		: `\nAsking ${total} ${role}(s), ${how}, with ${commands.length} commands in turn: ${commands.join("; ")}`;

const candidateFile = (folder: string, candidate: number): string =>
	shown(join(folder, `candidate-${candidate}.mdx`));

/** The call, in the author's terms: who won, who was rejected and why. */
const printDecision = (folder: string, result: DraftResult) => {
	const { decision } = result;
	const candidateOf = (id: string) =>
		result.candidates.find((candidate) => candidate.id === id);
	const named = (id: string) => {
		const candidate = candidateOf(id);
		return `candidate ${candidate?.candidate}${candidate?.command ? ` (${candidate.command})` : ""}`;
	};
	console.log("");
	for (const { id, by, reasons } of decision.rejected) {
		console.log(
			`  rejected by ${by} of ${decision.judges} judges: ${named(id)}${reasons[0] ? `. ${reasons[0]}` : ""}`,
		);
	}
	if (decision.call === "none") {
		console.log(
			decision.judges === 0
				? "No ballots, so no call."
				: "No winner: most judges rejected every draft. The stub may need more from you first: a sharper claim, or your notes (--notes <path>).",
		);
		return;
	}
	if (decision.call === "split") {
		console.log(
			`The judges split: no draft was ranked above every other by most of ${decision.judges}. The choice is yours:`,
		);
		for (const id of decision.order) {
			const candidate = candidateOf(id);
			if (!candidate) continue;
			console.log(
				`  ${named(id)}, ${candidate.words} words: ${candidateFile(folder, candidate.candidate)}`,
			);
		}
		console.log(
			`Write one into the chapter: bun run bookkit draft apply ${shown(folder)} --pick <candidate>`,
		);
		return;
	}
	const winner = candidateOf(decision.winner);
	console.log(
		`Winner: ${named(decision.winner)}, ${winner?.words} words${winner?.binds.length ? `, binds ${winner.binds.join(", ")}` : ", binds no mechanism"}. First choice of ${decision.firsts} of ${decision.judges} judge(s).`,
	);
	// One judge's reason; the others' are in their ballots.
	const reason = result.judges.find(
		({ ballot }) => ballot.ranking[0] === decision.winner && ballot.why,
	);
	if (reason) console.log(`  judge ${reason.judge}: ${reason.ballot.why}`);
	if (winner) {
		console.log(
			`  read it: ${candidateFile(folder, winner.candidate)} (each judge's ballot is beside it)`,
		);
	}
};

const applyAndReport = async (
	folder: string,
	request: DraftRequest,
	candidate: number,
): Promise<number> => {
	const applied = await applyCandidate(folder, request, candidate);
	if ("error" in applied) {
		console.error(applied.error);
		return 1;
	}
	console.log(
		`\nWrote candidate ${candidate} into ${request.chapter} (${applied.words} words). It is a draft under your name: read it, change what you would not say, then check it: bun run bookkit check ${request.chapter}`,
	);
	return 0;
};

const writerHint = (folder: string, missing: number[]): string =>
	`No writer command, so the brief is written and nothing is asked.\n  Give each of ${missing.length} writer(s) ${shown(join(folder, "brief.md"))}, each in a session of its own, and save the replies as ${missing.map((n) => `candidate-${n}.mdx`).join(", ")} in ${shown(folder)}.\n  then: bun run bookkit draft resume\n  To have bookkit ask them: set ${WRITER_COMMAND_ENV} to a command that reads a prompt on stdin and prints the reply (an LLM's command-line tool), or pass --writer "<command>". Several commands (one per line, or --writer more than once) write the candidates in turn, so they can come from several models.`;

const judgeHint = (folder: string, missing: number[]): string =>
	`No judge command, so the judges' prompts are written and nothing is asked.\n  Give each judge its prompt, in a session of its own (${missing.map((n) => shown(join(folder, `judge-${n}`, "prompt.md"))).join(", ")}), and save the replies as ${missing.map((n) => `ballot-${n}.json`).join(", ")} in ${shown(folder)}.\n  then: bun run bookkit draft resume\n  To have bookkit ask them: set ${JUDGE_COMMAND_ENV} (the judges bun run bookkit judge asks), or pass --judge "<command>".`;

/**
 * Takes a request as far as it can go: writers for the candidates still
 * missing, the check on every candidate, judges for the ballots still
 * missing, then the call, and the winner into the chapter when asked.
 */
export async function continueRequest(
	folder: string,
	{ writers, judges, apply, parallel, timeoutSeconds }: Commands,
): Promise<number> {
	const request = readRequest(folder);
	if ("error" in request) {
		console.error(request.error);
		return 1;
	}
	const unwritten = missingCandidates(folder, request);
	if (unwritten.length > 0 && writers.length > 0) {
		console.log(
			asking(
				"writer",
				unwritten.length,
				parallel === 1 ? "one at a time" : `${parallel} at a time`,
				writers,
			),
		);
		await runWriters(folder, request, writers, {
			parallel,
			timeoutSeconds,
			onAsked: printAsked("writer", writers.length > 1),
		});
		const silent = missingCandidates(folder, request).length;
		if (silent > 0 && silent < request.candidates) {
			console.log(
				`  ${silent} of ${request.candidates} delivered nothing; the rest go on. To ask again: bun run bookkit draft resume ${shown(folder)}`,
			);
		}
	}
	const gated = await gateCandidates(folder, request);
	if (gated.length === 0) {
		if (writers.length > 0) {
			console.log(
				`\nNo writer delivered a draft. Ask again: bun run bookkit draft resume ${shown(folder)}`,
			);
			return 1;
		}
		console.log(`\n${writerHint(folder, unwritten)}`);
		return 0;
	}
	console.log("\nChecked as the chapter each would replace:");
	for (const gate of gated) {
		const errors = gate.findings.filter((finding) => finding.level === "error");
		console.log(
			gate.ok
				? `  ✓ candidate ${gate.candidate}: ${gate.words} words, binds ${gate.binds.length > 0 ? gate.binds.join(", ") : "no mechanism"}`
				: `  ✗ candidate ${gate.candidate}: out. ${errors.map((finding) => finding.message).join("; ")}`,
		);
	}
	const passed = gated.filter((gate) => gate.ok).map((gate) => gate.candidate);
	if (passed.length === 0) {
		console.log(
			`\nNo candidate passed the check, so there is nothing to judge. Each one's findings are in ${shown(join(folder, "gate.json"))}.`,
		);
		return 1;
	}
	const { removedBallots } = writeJudgeRequest(folder, request, passed);
	if (removedBallots > 0) {
		console.log(
			`\nThe candidates changed, so ${removedBallots} earlier ballot(s) no longer apply and were removed.`,
		);
	}
	const unjudged = missingBallots(folder, request);
	if (unjudged.length > 0 && judges.length === 0) {
		console.log(`\n${judgeHint(folder, unjudged)}`);
		return 0;
	}
	if (unjudged.length > 0) {
		console.log(asking("judge", unjudged.length, "each on its own", judges));
		const asked = await runDraftJudges(folder, request, judges);
		asked.forEach(printAsked("judge", judges.length > 1));
		if (asked.some((judge) => judge.error)) {
			console.log(
				`\nNot decided: every judge needs a ballot. Ask the rest again: bun run bookkit draft resume ${shown(folder)}\n(or save a judge's reply by hand as ballot-<n>.json in that folder).`,
			);
			return 1;
		}
	}
	const result = decideRequest(folder, request, gated);
	if ("error" in result) {
		console.error(result.error);
		return 1;
	}
	printDecision(folder, result);
	if (result.winner === undefined) {
		return result.decision.call === "none" ? 1 : 0;
	}
	if (result.applied !== undefined) {
		console.log(
			`Candidate ${result.applied} is already written into ${request.chapter}.`,
		);
		return 0;
	}
	if (apply) return applyAndReport(folder, request, result.winner);
	console.log(
		`Write it into the chapter: bun run bookkit draft apply ${shown(folder)}`,
	);
	if (revisionNotes(result).length > 0) {
		console.log(
			`Or have the writers make the changes the judges named first: bun run bookkit draft revise ${shown(folder)}`,
		);
	}
	return 0;
}

/** A new request for one chapter, taken as far as the commands allow. */
async function draftChapter(
	chapter: ChapterToDraft,
	chapters: ChapterToDraft[],
	rest: string[],
	commands: Commands,
): Promise<number> {
	const candidates = count(rest, "--candidates", 3);
	const judges = count(rest, "--judges", 3);
	// 0: the length of the book's drafted chapters.
	const words = count(rest, "--words", 0);
	if (candidates === undefined || judges === undefined || words === undefined) {
		return 1;
	}
	const notes = readNotes(
		rest.flatMap((arg, index) =>
			arg === "--notes" && rest[index + 1]
				? [resolveFromCaller(rest[index + 1])]
				: [],
		),
	);
	if ("error" in notes) {
		console.error(notes.error);
		return 1;
	}
	const input = await briefInputFor(chapter, {
		chapters,
		notes,
		targetWords: words === 0 ? undefined : words,
	});
	const brief = draftBrief(input);
	const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
	const name = `${chapter.book}-${basename(chapter.file).replace(/\.mdx?$/, "")}-${stamp}`;
	const folder = freshPath(join(draftingDir(), name));
	const file = relative(repoRoot(), chapter.file);
	startRequest(
		folder,
		{
			book: chapter.book,
			chapter: file,
			slug: chapter.slug,
			title: chapter.title,
			candidates,
			judges,
			minimumWords: chapter.minimumWords,
			targetWords: input.targetWords,
			created: new Date().toISOString(),
		},
		brief,
		readFileSync(chapter.file, "utf8"),
	);
	console.log(
		`\n${file}: ${chapter.words} words of prose${chapter.stub ? `, a stub until ${chapter.minimumWords}` : ""}. Drafting to about ${input.targetWords}${input.sample ? `, with "${input.sample.title}" as the sample` : ""}${notes.length > 0 ? `, from ${notes.length} file(s) of your notes` : ""}.`,
	);
	console.log(
		`  brief: ${shown(join(folder, "brief.md"))} (${countWords(brief)} words)`,
	);
	return continueRequest(folder, commands);
}

/** The folder a subcommand names, else the newest request that `wanted` accepts. */
const requestFolder = (
	rest: string[],
	wanted: (folder: string) => boolean = () => true,
): string | undefined => {
	const [named] = positionals(rest.slice(1), VALUED);
	return named ? resolveFromCaller(named) : requestFolders().find(wanted);
};

const NO_REQUEST =
	"No drafting requests yet. Start one with bun run bookkit draft <chapter>.";

async function applyCommand(rest: string[]): Promise<number> {
	const folder = requestFolder(
		rest,
		(candidate) => readResult(candidate) !== undefined,
	);
	if (!folder) {
		console.error(
			requestFolders().length === 0
				? NO_REQUEST
				: "No request has a call yet. Finish one first: bun run bookkit draft resume.",
		);
		return 1;
	}
	const request = readRequest(folder);
	if ("error" in request) {
		console.error(request.error);
		return 1;
	}
	const pick = rest.includes("--pick") ? count(rest, "--pick", 0) : null;
	if (pick === undefined) return 1;
	const result = readResult(folder);
	const candidate = pick ?? result?.winner;
	if (candidate === undefined) {
		console.error(
			result?.decision.call === "split"
				? `The judges split on ${shown(folder)}, so there is no winner to write. Name one: bun run bookkit draft apply ${shown(folder)} --pick <candidate>`
				: `${shown(folder)} has no winner to write${result ? ": most judges rejected every draft" : " yet: finish it with bun run bookkit draft resume"}. To write one anyway: --pick <candidate>.`,
		);
		return 1;
	}
	if (pick !== null && result?.winner !== pick) {
		console.log(
			result?.winner === undefined
				? `Writing candidate ${pick}, your pick.`
				: `Writing candidate ${pick}, your pick over the judges' candidate ${result.winner}.`,
		);
	}
	return applyAndReport(folder, request, candidate);
}

/**
 * bookkit draft revise [folder]: the winner of a request, redrafted by the
 * writers from what the judges who chose it said it still needs, then
 * checked and judged against the winner as it was.
 */
async function reviseCommand(
	rest: string[],
	commands: Commands,
): Promise<number> {
	const folder = requestFolder(
		rest,
		(candidate) => readResult(candidate)?.winner !== undefined,
	);
	if (!folder) {
		console.error(
			requestFolders().length === 0
				? NO_REQUEST
				: "No request has a winner to revise. Finish one first: bun run bookkit draft resume.",
		);
		return 1;
	}
	const request = readRequest(folder);
	if ("error" in request) {
		console.error(request.error);
		return 1;
	}
	const result = readResult(folder);
	if (result?.winner === undefined) {
		console.error(
			`${shown(folder)} has no winner to revise${result?.decision.call === "split" ? ": the judges split" : ""}.`,
		);
		return 1;
	}
	const notes = revisionNotes(result);
	if (notes.length === 0) {
		console.log(
			`The judges who chose candidate ${result.winner} named nothing it still needs, so there is nothing to revise. Write it into the chapter: bun run bookkit draft apply ${shown(folder)}`,
		);
		return 0;
	}
	const revisions = count(rest, "--candidates", 2);
	const judges = count(rest, "--judges", request.judges);
	if (revisions === undefined || judges === undefined) return 1;
	const into = freshPath(`${folder}-revised`);
	const started = startRevision(folder, into, request, result.winner, notes, {
		revisions,
		judges,
	});
	if (started) {
		console.error(started.error);
		return 1;
	}
	console.log(
		`\nRevising candidate ${result.winner} of ${shown(folder)} (${request.chapter}). What the judges who chose it said it still needs:`,
	);
	for (const note of notes) console.log(`  - ${note}`);
	console.log(
		`  brief: ${shown(join(into, "brief.md"))}; candidate 1 is the draft as it was, so a revision has to beat it.`,
	);
	return continueRequest(into, commands);
}

function resultsCommand(): number {
	const results = requestFolders().flatMap((folder) => {
		const result = readResult(folder);
		return result ? [result] : [];
	});
	if (results.length === 0) {
		console.log("No request has a call yet, so there is nothing to count.");
		return 0;
	}
	const { writers, judges } = tallyResults(results);
	const applied = results.filter(
		(result) => result.applied !== undefined,
	).length;
	console.log(
		`\n${results.length} request(s) with a call, ${applied} written into a chapter.\n\nWriters`,
	);
	for (const writer of writers.sort((a, b) => b.won - a.won)) {
		console.log(
			`  ${writer.command}\n    ${writer.drafts} draft(s): ${writer.compiled} passed the check, ${writer.rejected} rejected by the judges, ${writer.won} won, ${writer.applied} written into a chapter`,
		);
	}
	console.log("\nJudges");
	for (const judge of judges) {
		console.log(
			`  ${judge.command}\n    ${judge.ballots} ballot(s)${judge.decided > 0 ? `: first choice was the winner in ${judge.agreed} of ${judge.decided}` : ""}`,
		);
	}
	console.log("");
	return 0;
}

/**
 * bookkit draft [book] <chapter>: a new request. bookkit draft [book]
 * --stubs: one for each stub of the book, in reading order. bookkit draft
 * resume [folder]: asks whoever has not answered and makes the call. bookkit
 * draft apply [folder]: writes the winner into the chapter. bookkit draft
 * revise [folder]: redrafts the winner from the judges' notes. bookkit draft
 * results: each writer's and judge's record so far.
 */
export async function draft(rest: string[]): Promise<number> {
	if (rest[0] === "results") return resultsCommand();
	if (rest[0] === "apply") return applyCommand(rest);
	const commands = commandsOf(rest);
	if (!commands) return 1;
	if (rest[0] === "revise") return reviseCommand(rest, commands);
	if (rest[0] === "resume") {
		const folder = requestFolder(rest);
		if (!folder) {
			console.error(NO_REQUEST);
			return 1;
		}
		return continueRequest(folder, commands);
	}
	const stubs = rest.includes("--stubs");
	const [book, [named]] = takeBook(
		positionals(rest, VALUED),
		stubs ? 0 : 1,
		USAGE,
	);
	const chapters = await chaptersToDraft(book);
	if (stubs) {
		const todo = chapters.filter(
			(chapter) => chapter.stub && !isFramingChapter(chapter.file),
		);
		if (todo.length === 0) {
			console.log(`${book} has no stub to draft.`);
			return 0;
		}
		let failed = 0;
		for (const chapter of todo) {
			if ((await draftChapter(chapter, chapters, rest, commands)) !== 0) {
				failed += 1;
			}
		}
		console.log(
			`\n${todo.length} stub(s) of ${book}: ${todo.length - failed} with a draft to read or a step for you, ${failed} without.`,
		);
		return failed > 0 ? 1 : 0;
	}
	if (!named) {
		const next = chapters.find(
			(chapter) => chapter.stub && !isFramingChapter(chapter.file),
		);
		console.error(
			`Usage: ${USAGE}\n${next ? `${book}'s next stub: bun run bookkit draft ${book} ${next.slug}` : `${book} has no stub to draft.`}`,
		);
		return 1;
	}
	const chapter = chapterNamed(chapters, named);
	if (!chapter && books.includes(named)) {
		// One word that is a book's name: the book, with no chapter named.
		const next = (await chaptersToDraft(named)).find(
			(other) => other.stub && !isFramingChapter(other.file),
		);
		console.error(
			`Usage: ${USAGE}\n${next ? `${named}'s next stub: bun run bookkit draft ${named} ${next.slug}` : `${named} has no stub to draft.`}`,
		);
		return 1;
	}
	if (!chapter) {
		console.error(
			`${book} has no chapter "${named}".${didYouMean(
				named,
				chapters.map((other) => other.slug),
			)} Name it by its slug, its file name, or its number.`,
		);
		return 1;
	}
	if (isFramingChapter(chapter.file)) {
		console.error(
			`${basename(chapter.file)} is the chapter ${book}'s frame is checked in: its headings are the frame's steps, which a draft is not held to. Write it yourself.`,
		);
		return 1;
	}
	if (!chapter.stub && !rest.includes("--redraft")) {
		console.error(
			`${basename(chapter.file)} has ${chapter.words} words of prose, so it is not a stub${chapter.minimumWords > 0 ? ` (under ${chapter.minimumWords})` : ""}. To draft over what is there, add --redraft; nothing is written until bun run bookkit draft apply.`,
		);
		return 1;
	}
	return draftChapter(chapter, chapters, rest, commands);
}
