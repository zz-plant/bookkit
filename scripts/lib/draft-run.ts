import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { basename, join, relative } from "node:path";
import { repoRoot } from "../_lib";
import {
	type Ballot,
	type DraftDecision,
	decideDrafts,
	judgeDraftsPrompt,
	readBallot,
} from "./draft-ballots";
import {
	candidateSource,
	extractDraft,
	type GateResult,
	gateCandidate,
	revisionBrief,
} from "./draft-brief";
import { askCommand, commandFor, commandLabel, inTurn } from "./model-command";

/**
 * One `bookkit draft` request, as a folder under .bookkit/drafting/ (per
 * author, gitignored). Every step reads what the folder holds and adds what
 * is missing, so a request can be resumed after a model fails, and a person
 * can stand in for any model by saving its file:
 *
 *   request.json        the chapter, and how many candidates and judges
 *   brief.md            what each writer is given
 *   stub.mdx            the chapter as briefed; apply refuses once it changes
 *   candidate-<n>.mdx   writer n's draft, under the stub's frontmatter
 *   writer-<n>/         command.txt (who wrote it) and reply.txt (the raw reply)
 *   gate.json           each candidate's check: ok, words, findings
 *   key.json            the judges' ids for the candidates that passed
 *   judge-<n>/          prompt.md, command.txt, and reply.txt when it failed
 *   ballot-<n>.json     judge n's ranking and rejections
 *   result.json         the call, and who wrote and judged what
 *
 * A revision (`draft revise`) is a request of the same shape whose brief adds
 * the winner of an earlier one and the judges' notes on it. Its candidate 1
 * is that winner, unrevised, so a revision has to beat the draft it revises.
 *
 * Nothing here touches the book until applyCandidate.
 */

/** The environment variable that names the writer commands, one per line. */
export const WRITER_COMMAND_ENV = "BOOKKIT_DRAFT_COMMAND";

export type DraftRequest = {
	book: string;
	/** The chapter file, from the workspace root. */
	chapter: string;
	slug: string;
	title: string;
	candidates: number;
	judges: number;
	minimumWords: number;
	targetWords: number;
	created: string;
	/** The request folder (its name) whose winner this one revises. */
	revises?: string;
};

export const draftingDir = (): string =>
	join(repoRoot(), ".bookkit", "drafting");

const read = (path: string): string => readFileSync(path, "utf8");
const json = (value: unknown): string =>
	`${JSON.stringify(value, null, "\t")}\n`;
const candidatePath = (folder: string, n: number) =>
	join(folder, `candidate-${n}.mdx`);
const ballotPath = (folder: string, n: number) =>
	join(folder, `ballot-${n}.json`);

/** A file beside writer or judge n, in a folder made on first use. */
const side = (
	folder: string,
	role: "writer" | "judge",
	n: number,
	file: string,
): string => {
	mkdirSync(join(folder, `${role}-${n}`), { recursive: true });
	return join(folder, `${role}-${n}`, file);
};

/** The command recorded for writer or judge n; undefined when saved by hand. */
const commandOf = (
	folder: string,
	role: "writer" | "judge",
	n: number,
): string | undefined => {
	const path = join(folder, `${role}-${n}`, "command.txt");
	return existsSync(path) ? read(path).trim() || undefined : undefined;
};

/** The numbers n for which `<prefix>-<n>.<extension>` exists, in order. */
const numbered = (
	folder: string,
	prefix: string,
	extension: string,
): number[] =>
	readdirSync(folder)
		.map((name) => name.match(/^([a-z]+)-(\d+)\.([a-z]+)$/))
		.filter(
			(match): match is RegExpMatchArray =>
				match !== null && match[1] === prefix && match[3] === extension,
		)
		.map((match) => Number(match[2]))
		.sort((a, b) => a - b);

export const startRequest = (
	folder: string,
	request: DraftRequest,
	brief: string,
	stub: string,
): void => {
	mkdirSync(folder, { recursive: true });
	writeFileSync(join(folder, "request.json"), json(request));
	writeFileSync(join(folder, "brief.md"), brief);
	writeFileSync(join(folder, "stub.mdx"), stub);
};

export const readRequest = (
	folder: string,
): DraftRequest | { error: string } => {
	const path = join(folder, "request.json");
	if (!existsSync(path)) {
		return {
			error: `No drafting request in ${folder}. Start one with bun run bookkit draft <chapter>.`,
		};
	}
	return JSON.parse(read(path)) as DraftRequest;
};

/** Request folders, newest first. */
export const requestFolders = (): string[] => {
	const root = draftingDir();
	return existsSync(root)
		? readdirSync(root)
				.map((name) => join(root, name))
				.filter((folder) => existsSync(join(folder, "request.json")))
				.sort(
					(a, b) =>
						statSync(join(b, "request.json")).mtimeMs -
						statSync(join(a, "request.json")).mtimeMs,
				)
		: [];
};

/** Candidates the request asks for that no writer has delivered. */
export const missingCandidates = (
	folder: string,
	request: DraftRequest,
): number[] =>
	Array.from({ length: request.candidates }, (_, index) => index + 1).filter(
		(n) => !existsSync(candidatePath(folder, n)),
	);

export type Asked = {
	/** The candidate or judge number. */
	n: number;
	command: string;
	seconds: number;
	/** Why nothing was saved, and where the reply was kept. */
	error?: string;
};

/** How the writers are asked: how many at once, and how long each may take. */
export type WriterOptions = {
	/** Writers asked at once (default 1). */
	parallel?: number;
	/** Seconds one writer may take (default: model-command's limit). */
	timeoutSeconds?: number;
	/** Called as each writer finishes, so a long run shows its progress. */
	onAsked?: (asked: Asked) => void;
};

/**
 * Asks a writer for each missing candidate: candidate n from the nth command,
 * in turn, so the candidates can come from several models. One writer at a
 * time unless told otherwise, and each command's candidates together: local
 * models share one server, where a second request waits out the first, and a
 * second model evicts the first.
 */
export const runWriters = (
	folder: string,
	request: DraftRequest,
	commands: readonly string[],
	{ parallel = 1, timeoutSeconds, onAsked }: WriterOptions = {},
): Promise<Asked[]> => {
	const brief = read(join(folder, "brief.md"));
	const stub = read(join(folder, "stub.mdx"));
	const turn = (n: number) => (n - 1) % commands.length;
	const ask = async (n: number): Promise<Asked> => {
		const command = commandFor(commands, n);
		const label = commandLabel(command);
		const asked = await askCommand(
			command,
			brief,
			"BOOKKIT_DRAFT_BRIEF",
			timeoutSeconds === undefined ? undefined : timeoutSeconds * 1000,
		);
		writeFileSync(side(folder, "writer", n, "reply.txt"), asked.output);
		const error =
			asked.error ??
			(asked.reply.trim() ? undefined : "the command printed nothing");
		if (error) {
			return {
				n,
				command: label,
				seconds: asked.seconds,
				error: `${error} (output in writer-${n}/reply.txt)`,
			};
		}
		writeFileSync(
			candidatePath(folder, n),
			candidateSource(stub, extractDraft(asked.reply)),
		);
		writeFileSync(side(folder, "writer", n, "command.txt"), `${label}\n`);
		return { n, command: label, seconds: asked.seconds };
	};
	return inTurn(
		missingCandidates(folder, request)
			.sort((a, b) => turn(a) - turn(b) || a - b)
			.map((n) => async () => {
				const asked = await ask(n);
				onAsked?.(asked);
				return asked;
			}),
		parallel,
	);
};

export type GatedCandidate = GateResult & { candidate: number };

/**
 * Checks every candidate in the folder as the chapter it would replace. Each
 * file is rewritten under the stub's frontmatter first, so one saved by hand
 * is held to the same rule as a writer's: a draft changes the body,
 * `mechanisms:`, and `summary:`.
 */
export const gateCandidates = async (
	folder: string,
	request: DraftRequest,
): Promise<GatedCandidate[]> => {
	const stub = read(join(folder, "stub.mdx"));
	const gated: GatedCandidate[] = [];
	for (const candidate of numbered(folder, "candidate", "mdx")) {
		const source = candidateSource(
			stub,
			read(candidatePath(folder, candidate)),
		);
		writeFileSync(candidatePath(folder, candidate), source);
		gated.push({
			candidate,
			...(await gateCandidate(request.book, source, request.minimumWords)),
		});
	}
	if (gated.length > 0) writeFileSync(join(folder, "gate.json"), json(gated));
	return gated;
};

type Key = Array<{ id: string; candidate: number }>;

const readKey = (folder: string): Key =>
	existsSync(join(folder, "key.json"))
		? (JSON.parse(read(join(folder, "key.json"))) as Key)
		: [];

const shuffled = <T>(items: readonly T[]): T[] => {
	const copy = [...items];
	for (let i = copy.length - 1; i > 0; i -= 1) {
		const j = Math.floor(Math.random() * (i + 1));
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}
	return copy;
};

/**
 * Writes the judges' request for the candidates that passed the gate:
 * key.json (neutral ids, in an order that says nothing of who wrote which;
 * keep it from the judges) and a prompt per judge, each with the drafts in an
 * order of its own. Left alone when already written for the same candidates;
 * ballots on any other set are removed, since their ids no longer apply.
 */
export const writeJudgeRequest = (
	folder: string,
	request: DraftRequest,
	passed: readonly number[],
): { ids: string[]; removedBallots: number } => {
	const existing = readKey(folder);
	const same =
		existing.length === passed.length &&
		existing.every(({ candidate }) => passed.includes(candidate));
	if (same) return { ids: existing.map(({ id }) => id), removedBallots: 0 };
	const stale = numbered(folder, "ballot", "json");
	for (const judge of stale) rmSync(ballotPath(folder, judge));
	const key: Key = shuffled(passed).map((candidate, index) => ({
		id: `D${index + 1}`,
		candidate,
	}));
	writeFileSync(join(folder, "key.json"), json(key));
	const brief = read(join(folder, "brief.md"));
	const drafts = key.map(({ id, candidate }) => ({
		id,
		source: read(candidatePath(folder, candidate)),
	}));
	for (let judge = 1; judge <= request.judges; judge += 1) {
		writeFileSync(
			side(folder, "judge", judge, "prompt.md"),
			judgeDraftsPrompt(brief, judge === 1 ? drafts : shuffled(drafts)),
		);
	}
	return { ids: key.map(({ id }) => id), removedBallots: stale.length };
};

/** Judges the request asks for that have no ballot yet. */
export const missingBallots = (
	folder: string,
	request: DraftRequest,
): number[] =>
	Array.from({ length: request.judges }, (_, index) => index + 1).filter(
		(n) => !existsSync(ballotPath(folder, n)),
	);

/**
 * Asks each judge without a ballot, all at once: judge n with the nth
 * command, in turn, so a panel can mix models.
 */
export const runDraftJudges = (
	folder: string,
	request: DraftRequest,
	commands: readonly string[],
): Promise<Asked[]> => {
	const ids = readKey(folder).map(({ id }) => id);
	return Promise.all(
		missingBallots(folder, request).map(async (n) => {
			const command = commandFor(commands, n);
			const label = commandLabel(command);
			const asked = await askCommand(
				command,
				read(side(folder, "judge", n, "prompt.md")),
				"BOOKKIT_JUDGE_PROMPT",
			);
			const ballot = asked.error ? null : readBallot(asked.reply, ids);
			if (!ballot || "error" in ballot) {
				const kept = side(folder, "judge", n, "reply.txt");
				writeFileSync(kept, asked.output);
				return {
					n,
					command: label,
					seconds: asked.seconds,
					error: `${asked.error ?? ballot?.error} (reply in judge-${n}/reply.txt)`,
				};
			}
			writeFileSync(ballotPath(folder, n), json(ballot));
			writeFileSync(side(folder, "judge", n, "command.txt"), `${label}\n`);
			return { n, command: label, seconds: asked.seconds };
		}),
	);
};

export type DraftResult = {
	book: string;
	chapter: string;
	decided: string;
	candidates: Array<{
		candidate: number;
		/** The id judges knew it by; absent when it did not pass the gate. */
		id?: string;
		/** The command that wrote it; absent when saved by hand. */
		command?: string;
		ok: boolean;
		words: number;
		binds: string[];
		errors: string[];
	}>;
	judges: Array<{ judge: number; command?: string; ballot: Ballot }>;
	decision: DraftDecision;
	/** The winning candidate's number, when the judges agree on one. */
	winner?: number;
	/** The candidate written into the chapter, once one is. */
	applied?: number;
};

export const readResult = (folder: string): DraftResult | undefined =>
	existsSync(join(folder, "result.json"))
		? (JSON.parse(read(join(folder, "result.json"))) as DraftResult)
		: undefined;

/**
 * The call on a request, from its gate and every ballot in the folder, kept
 * as result.json. An unreadable ballot is an error naming it: a call must
 * not quietly leave a judge out.
 */
export const decideRequest = (
	folder: string,
	request: DraftRequest,
	gated: readonly GatedCandidate[],
	now: Date = new Date(),
): DraftResult | { error: string } => {
	const key = readKey(folder);
	const ids = key.map(({ id }) => id);
	const judges: DraftResult["judges"] = [];
	for (const judge of numbered(folder, "ballot", "json")) {
		const ballot = readBallot(read(ballotPath(folder, judge)), ids);
		if ("error" in ballot) {
			return {
				error: `ballot-${judge}.json: ${ballot.error}. Fix it, or remove it and run bun run bookkit draft resume.`,
			};
		}
		judges.push({ judge, command: commandOf(folder, "judge", judge), ballot });
	}
	const decision = decideDrafts(
		ids,
		judges.map(({ ballot }) => ballot),
	);
	const result: DraftResult = {
		book: request.book,
		chapter: request.chapter,
		decided: now.toISOString(),
		candidates: gated.map((gate) => ({
			candidate: gate.candidate,
			id: key.find(({ candidate }) => candidate === gate.candidate)?.id,
			command: commandOf(folder, "writer", gate.candidate),
			ok: gate.ok,
			words: gate.words,
			binds: gate.binds,
			errors: gate.findings
				.filter((finding) => finding.level === "error")
				.map((finding) => finding.message),
		})),
		judges,
		decision,
		winner:
			decision.call === "winner"
				? key.find(({ id }) => id === decision.winner)?.candidate
				: undefined,
		// A call made again after apply still says what was written.
		applied: readResult(folder)?.applied,
	};
	writeFileSync(join(folder, "result.json"), json(result));
	return result;
};

/**
 * Writes a candidate into its chapter: the only step that changes the book.
 * Refuses when the chapter is no longer the stub the writers were briefed
 * on, or when the candidate no longer passes the check (the book may have
 * changed since).
 */
export const applyCandidate = async (
	folder: string,
	request: DraftRequest,
	candidate: number,
): Promise<{ file: string; words: number } | { error: string }> => {
	const path = candidatePath(folder, candidate);
	if (!existsSync(path)) {
		return { error: `No candidate ${candidate} in ${folder}.` };
	}
	const file = join(repoRoot(), request.chapter);
	if (!existsSync(file) || read(file) !== read(join(folder, "stub.mdx"))) {
		return {
			error: `${request.chapter} has changed since these drafts were written, so none was written over it. Draft it again: bun run bookkit draft ${request.book} ${request.slug}.`,
		};
	}
	const source = read(path);
	const gate = await gateCandidate(request.book, source, request.minimumWords);
	if (!gate.ok) {
		return {
			error: `Candidate ${candidate} does not pass the check, so it was not written:\n${gate.findings
				.filter((finding) => finding.level === "error")
				.map((finding) => `  ${finding.message}`)
				.join("\n")}`,
		};
	}
	writeFileSync(file, source);
	const result = readResult(folder);
	if (result) {
		writeFileSync(
			join(folder, "result.json"),
			json({ ...result, applied: candidate }),
		);
	}
	return { file, words: gate.words };
};

/**
 * What the judges who chose the winner still want changed in it: each one's
 * fixes, or, on a ballot from before judges were asked for fixes, its reason.
 * Draft ids mean nothing to a writer who sees one draft, so they are named.
 */
export const revisionNotes = (result: DraftResult): string[] => {
	if (result.decision.call !== "winner") return [];
	const { winner } = result.decision;
	const out = new Set(result.decision.rejected.map(({ id }) => id));
	const named = (text: string) =>
		text.replace(/\bD\d+\b/g, (id) =>
			id === winner ? "this draft" : "another draft",
		);
	const notes = result.judges.flatMap(({ ballot }) => {
		if (ballot.ranking.find((id) => !out.has(id)) !== winner) return [];
		const fixes = ballot.fixes ?? [];
		return fixes.length > 0 ? fixes : ballot.why ? [ballot.why] : [];
	});
	return [...new Set(notes.map(named))];
};

/**
 * Starts a revision of a request's winner in `into`: the brief with the
 * winner and the notes, the winner as candidate 1, and room for `revisions`
 * more. The chapter may still be the stub or already hold the winner (once
 * applied); a revision applies over whichever it is. Refuses once the author
 * has changed the chapter: their edits are not the judges' draft.
 */
export const startRevision = (
	folder: string,
	into: string,
	request: DraftRequest,
	winner: number,
	notes: readonly string[],
	{ revisions, judges }: { revisions: number; judges: number },
): { error: string } | undefined => {
	const winning = read(candidatePath(folder, winner));
	const file = join(repoRoot(), request.chapter);
	const chapter = existsSync(file) ? read(file) : "";
	if (chapter !== read(join(folder, "stub.mdx")) && chapter !== winning) {
		return {
			error: `${request.chapter} has changed since candidate ${winner} was chosen, so there is no draft of the judges' to revise. Your edits are yours: check them with bun run bookkit review ${request.chapter}.`,
		};
	}
	const command = commandOf(folder, "writer", winner);
	startChapterRevision(
		into,
		{ ...request, revises: basename(folder) },
		read(join(folder, "brief.md")),
		chapter,
		winning,
		notes,
		{ revisions, judges, unrevised: command ?? "saved by hand" },
	);
	return undefined;
};

/**
 * A revision request in `into`: the brief with `draft` and the notes on it,
 * `draft` itself as candidate 1, unrevised, and room for `revisions` more.
 * `chapter` is the file as it stands, which apply checks has not changed.
 * `draft revise` starts one from a winner and the judges' fixes, and
 * `bookkit finish` from the chapter and a review's findings.
 */
export const startChapterRevision = (
	into: string,
	request: DraftRequest,
	brief: string,
	chapter: string,
	draft: string,
	notes: readonly string[],
	{
		revisions,
		judges,
		unrevised,
	}: { revisions: number; judges: number; unrevised: string },
): void => {
	startRequest(
		into,
		{
			...request,
			candidates: revisions + 1,
			judges,
			created: new Date().toISOString(),
		},
		revisionBrief(brief, draft, notes),
		chapter,
	);
	writeFileSync(candidatePath(into, 1), draft);
	writeFileSync(
		side(into, "writer", 1, "command.txt"),
		`unrevised: ${unrevised}\n`,
	);
};

/**
 * The request whose applied candidate the chapter still holds, word for
 * word: the chapter is a model's draft, not yet edited by its author. None
 * once the author has changed it, or when no draft was ever applied to it.
 */
export const draftHeldBy = (chapterFile: string): string | undefined => {
	if (!existsSync(chapterFile)) return undefined;
	const current = read(chapterFile);
	const file = relative(repoRoot(), chapterFile);
	return requestFolders().find((folder) => {
		const result = readResult(folder);
		return (
			result?.applied !== undefined &&
			result.chapter === file &&
			existsSync(candidatePath(folder, result.applied)) &&
			read(candidatePath(folder, result.applied)) === current
		);
	});
};

export type WriterTally = {
	command: string;
	/** Candidates it delivered. */
	drafts: number;
	/** Of those, the ones that passed the check. */
	compiled: number;
	/** Of those, the ones most judges rejected. */
	rejected: number;
	/** Requests it won. */
	won: number;
	/** Drafts of its that were written into a chapter. */
	applied: number;
};

export type JudgeTally = {
	command: string;
	ballots: number;
	/** Ballots on a request with a winner whose first standing choice was it. */
	agreed: number;
	/** Ballots on a request with a winner. */
	decided: number;
};

const BY_HAND = "(saved by hand)";

/**
 * Each writer command's record over a set of results, and each judge
 * command's: what a cheap model's drafts are worth, counted.
 */
export const tallyResults = (
	results: readonly DraftResult[],
): { writers: WriterTally[]; judges: JudgeTally[] } => {
	const writers = new Map<string, WriterTally>();
	const judges = new Map<string, JudgeTally>();
	for (const result of results) {
		const out = new Set(result.decision.rejected.map(({ id }) => id));
		const winner =
			result.decision.call === "winner" ? result.decision.winner : undefined;
		for (const candidate of result.candidates) {
			const command = candidate.command ?? BY_HAND;
			const tally = writers.get(command) ?? {
				command,
				drafts: 0,
				compiled: 0,
				rejected: 0,
				won: 0,
				applied: 0,
			};
			tally.drafts += 1;
			if (candidate.ok) tally.compiled += 1;
			if (candidate.id && out.has(candidate.id)) tally.rejected += 1;
			if (candidate.id && candidate.id === winner) tally.won += 1;
			if (result.applied === candidate.candidate) tally.applied += 1;
			writers.set(command, tally);
		}
		for (const { command = BY_HAND, ballot } of result.judges) {
			const tally = judges.get(command) ?? {
				command,
				ballots: 0,
				agreed: 0,
				decided: 0,
			};
			tally.ballots += 1;
			if (winner) {
				tally.decided += 1;
				if (ballot.ranking.find((id) => !out.has(id)) === winner) {
					tally.agreed += 1;
				}
			}
			judges.set(command, tally);
		}
	}
	return { writers: [...writers.values()], judges: [...judges.values()] };
};
