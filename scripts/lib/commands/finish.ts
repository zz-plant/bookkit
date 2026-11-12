import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { repoRoot } from "../../_lib";
import { chapterNamed } from "../chapter-moves";
import { didYouMean, flagValue, positionals } from "../cli";
import {
	briefInputFor,
	type ChapterToDraft,
	chaptersToDraft,
	draftBrief,
	gateCandidate,
	isFramingChapter,
} from "../draft-brief";
import {
	draftHeldBy,
	draftingDir,
	missingBallots,
	missingCandidates,
	readRequest,
	readResult,
	startChapterRevision,
	WRITER_COMMAND_ENV,
} from "../draft-run";
import { JUDGE_COMMAND_ENV } from "../judge-runner";
import { commandsFrom, freshPath, jsonInReply } from "../model-command";
import { books, takeBook } from "./context";
import { continueRequest } from "./draft";
import { printReview, type Review, runReview } from "./review";

/**
 * `bookkit finish [book] [chapter]`: the last mile from a model's draft to a
 * chapter a reviewer has nothing left to say about. Each round reviews the
 * chapter as it stands (`bookkit review`), hands the findings and the check's
 * warnings to the writers as a revision (as `draft revise` hands them the
 * judges' fixes), and has blind judges choose between the revisions and the
 * chapter as it was. It stops when a review finds nothing, when no revision
 * beats the chapter, when the findings stop falling, or after `--rounds`.
 *
 * It works only on a chapter that still holds a draft word for word, as
 * `draft apply` wrote it: an author's edits are never rewritten unless
 * `--include-edited` says so. Every request it makes is a folder under
 * .bookkit/drafting/ or .bookkit/reviewing/, like any other.
 */

const VALUED = [
	"--rounds",
	"--reviewers",
	"--judges",
	"--candidates",
	"--writer",
	"--judge",
	"--parallel",
	"--timeout",
];

const USAGE =
	'bun run bookkit finish [book] [chapter] [--rounds <n>] [--writer "<command>"] [--judge "<command>"] [--include-edited]';

const shown = (path: string): string => relative(process.cwd(), path) || ".";

const whole = (
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

const findingCount = (reviews: readonly Review[]): number =>
	reviews.reduce((sum, one) => sum + (one.findings?.length ?? 0), 0);

/** What a revision is asked to change: each finding with its fix, then the check's warnings. */
export const revisionNotesFrom = (
	reviews: readonly Review[],
	warnings: ReadonlyArray<{ message: string; fix?: string }>,
): string[] => [
	...new Set([
		...reviews.flatMap((one) =>
			(one.findings ?? []).map(
				(finding) =>
					`${finding.where ? `${finding.where}: ` : ""}${finding.what}${finding.fix ? ` Fix: ${finding.fix}` : ""}`,
			),
		),
		...warnings.map(
			(warning) =>
				`The check warns: ${warning.message}${warning.fix ? ` Fix: ${warning.fix}` : ""}`,
		),
	]),
];

type Options = {
	rounds: number;
	reviewers: number;
	judges: number;
	revisions: number;
	parallel: number;
	timeoutSeconds: number;
	writers: string[];
	judgeCommands: string[];
};

/**
 * The Title Case labels `check:concepts` finds in one chapter that the book
 * defines nowhere: a writer has coined a concept, which rule 2 forbids.
 * Registering one is the author's call, so a revision is asked to drop it.
 */
export const unregisteredConceptsIn = (
	book: string,
	file: string,
): Array<{ message: string; fix: string }> => {
	const run = spawnSync(
		process.execPath,
		[join(repoRoot(), "scripts", "check-floating-concepts.ts"), book, "--json"],
		{ cwd: repoRoot(), encoding: "utf8" },
	);
	const report = jsonInReply(run.stdout ?? "") as
		| { findings?: Array<{ file?: string; message?: string }> }
		| undefined;
	return (report?.findings ?? [])
		.filter((finding) => finding.file === file && finding.message)
		.map((finding) => ({
			message: `${finding.message}: the book defines no such concept`,
			fix: "Say it in plain words, or use one of the book's mechanisms or glossary terms by its title.",
		}));
};

/**
 * Of the versions a chapter's reviews saw, the one with the fewest findings,
 * the latest of a tie, which the judges preferred: the judges choose between drafts and the reviewer
 * counts what is wrong with one, and they do not always agree, so a round
 * can leave the chapter worse than the round before.
 */
export const bestVersion = <T extends { count: number }>(
	versions: readonly T[],
): T =>
	versions.reduce((best, version) =>
		version.count <= best.count ? version : best,
	);

/** One chapter through its rounds; the line that sums it up. */
async function finishChapter(
	book: string,
	slug: string,
	options: Options,
): Promise<{ line: string; failed: boolean }> {
	const versions: Array<{ round: number; count: number; source: string }> = [];
	const chapterOf = async () => {
		const chapters = await chaptersToDraft(book);
		return {
			chapters,
			chapter: chapters.find((other) => other.slug === slug) as ChapterToDraft,
		};
	};
	/**
	 * The line for a chapter that stops here: its findings and warnings by
	 * round, and, when a later round made it worse by that count, the better
	 * version put back.
	 */
	const settle = (
		file: string,
		path: string,
		why: string,
		failed = false,
	): { line: string; failed: boolean } => {
		const trail = versions.map(({ count }) => count).join(" → ");
		const best = bestVersion(versions);
		const current = versions[versions.length - 1];
		if (best !== current && readFileSync(path, "utf8") === current.source) {
			writeFileSync(path, best.source);
			return {
				line: `${file}: ${trail} findings, ${why}; kept round ${best.round}'s version (${best.count})`,
				failed,
			};
		}
		return { line: `${file}: ${trail} findings, ${why}`, failed };
	};
	for (let round = 1; ; round += 1) {
		const { chapters, chapter } = await chapterOf();
		const file = relative(repoRoot(), chapter.file);
		console.log(`\n${file}, round ${round}: review`);
		const { folder, reviews } = await runReview(
			chapter,
			chapters,
			options.judgeCommands,
			options.reviewers,
		);
		for (const one of reviews) printReview(folder, one);
		if (reviews.some((one) => one.error)) {
			return versions.length > 0
				? settle(
						file,
						chapter.file,
						`stopped, a reviewer failed (${shown(folder)})`,
						true,
					)
				: {
						line: `${file}: stopped, a reviewer failed (${shown(folder)})`,
						failed: true,
					};
		}
		const source = readFileSync(chapter.file, "utf8");
		const warnings: Array<{ message: string; fix?: string }> = [
			...(
				await gateCandidate(book, source, chapter.minimumWords)
			).findings.filter((finding) => finding.level === "warning"),
			...unregisteredConceptsIn(book, file),
		];
		const notes = revisionNotesFrom(reviews, warnings);
		// What the round asks the writers to fix: the reviewer's findings and
		// the checks' warnings, so a revision that clears a warning counts.
		const count = findingCount(reviews) + warnings.length;
		versions.push({ round, count, source });
		if (notes.length === 0) {
			return settle(file, chapter.file, "nothing left to change");
		}
		if (round > options.rounds) {
			return settle(file, chapter.file, `after ${options.rounds} round(s)`);
		}
		if (round > 1 && count >= versions[round - 2].count) {
			return settle(file, chapter.file, "no longer falling");
		}
		const brief = draftBrief(
			await briefInputFor(chapter, {
				chapters,
				// The length it has: a revision fixes, it does not grow.
				targetWords: Math.max(10, Math.round(chapter.words / 10) * 10),
			}),
		);
		const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
		const into = freshPath(
			join(
				draftingDir(),
				`${book}-${basename(chapter.file).replace(/\.mdx?$/, "")}-finish-${stamp}`,
			),
		);
		startChapterRevision(
			into,
			{
				book,
				chapter: file,
				slug: chapter.slug,
				title: chapter.title,
				candidates: options.revisions + 1,
				judges: options.judges,
				minimumWords: chapter.minimumWords,
				targetWords: chapter.words,
				created: new Date().toISOString(),
				revises: `review ${basename(folder)}`,
			},
			brief,
			source,
			source,
			notes,
			{
				revisions: options.revisions,
				judges: options.judges,
				unrevised: "the chapter as it stood",
			},
		);
		console.log(
			`\n${file}, round ${round}: ${notes.length} note(s) to the writers; candidate 1 is the chapter as it stands.`,
		);
		const commands = {
			writers: options.writers,
			judges: options.judgeCommands,
			apply: true,
			parallel: options.parallel,
			timeoutSeconds: options.timeoutSeconds,
		};
		await continueRequest(into, commands);
		const request = readRequest(into);
		// A writer or judge that failed is asked once more: one bad reply
		// should not end a chapter's rounds.
		if (
			!readResult(into) &&
			!("error" in request) &&
			(missingCandidates(into, request).length > 0 ||
				missingBallots(into, request).length > 0)
		) {
			console.log(`\n${file}, round ${round}: asking again who did not answer`);
			await continueRequest(into, commands);
		}
		const result = readResult(into);
		if (!result) {
			return settle(
				file,
				chapter.file,
				`stopped, a writer or judge did not answer twice (${shown(into)})`,
				true,
			);
		}
		if (result.applied === undefined || result.applied === 1) {
			return settle(
				file,
				chapter.file,
				result.applied === 1
					? "no revision beat it"
					: `the judges chose no revision (${result.decision.call})`,
			);
		}
	}
}

export async function finish(rest: string[]): Promise<number> {
	const rounds = whole(rest, "--rounds", 3);
	const reviewers = whole(rest, "--reviewers", 1);
	const judges = whole(rest, "--judges", 3);
	const revisions = whole(rest, "--candidates", 2);
	const parallel = whole(rest, "--parallel", 1);
	const timeoutSeconds = whole(rest, "--timeout", 300);
	if (
		[rounds, reviewers, judges, revisions, parallel, timeoutSeconds].some(
			(value) => value === undefined,
		)
	) {
		return 1;
	}
	const writers = commandsFrom(rest, "--writer", WRITER_COMMAND_ENV);
	const judgeCommands = commandsFrom(rest, "--judge", JUDGE_COMMAND_ENV);
	if (writers.length === 0 || judgeCommands.length === 0) {
		console.error(
			`finish asks models at every step, so it needs a writer command (--writer, or ${WRITER_COMMAND_ENV}) and a judge command (--judge, or ${JUDGE_COMMAND_ENV}); the judges also review.\nUsage: ${USAGE}`,
		);
		return 1;
	}
	const positional = positionals(rest, VALUED);
	// One word that is a book's name is the book, with no chapter named.
	const [book, [named]] = takeBook(
		positional,
		positional.length === 1 && books.includes(positional[0]) ? 0 : 1,
		USAGE,
	);
	const chapters = await chaptersToDraft(book);
	const includeEdited = rest.includes("--include-edited");
	let todo: ChapterToDraft[];
	if (named) {
		const chapter = chapterNamed(chapters, named);
		if (!chapter) {
			console.error(
				`${book} has no chapter "${named}".${didYouMean(
					named,
					chapters.map((other) => other.slug),
				)}`,
			);
			return 1;
		}
		if (!includeEdited && !draftHeldBy(chapter.file)) {
			console.error(
				`${basename(chapter.file)} is not a draft as draft apply wrote it: it was edited since, or never drafted. finish does not rewrite an author's words; --include-edited lets it.`,
			);
			return 1;
		}
		todo = [chapter];
	} else {
		todo = chapters.filter(
			(chapter) =>
				!isFramingChapter(chapter.file) &&
				(includeEdited ? !chapter.stub : draftHeldBy(chapter.file)),
		);
		if (todo.length === 0) {
			console.log(
				`${book} has no chapter that still holds a draft as draft apply wrote it. Draft one first (bun run bookkit draft ${book} --stubs), or pass --include-edited.`,
			);
			return 0;
		}
	}
	const options = {
		rounds: rounds as number,
		reviewers: reviewers as number,
		judges: judges as number,
		revisions: revisions as number,
		parallel: parallel as number,
		timeoutSeconds: timeoutSeconds as number,
		writers,
		judgeCommands,
	};
	const lines: string[] = [];
	let failed = 0;
	for (const chapter of todo) {
		const done = await finishChapter(book, chapter.slug, options);
		lines.push(done.line);
		if (done.failed) failed += 1;
	}
	console.log(`\nFinished ${todo.length} chapter(s) of ${book}:`);
	for (const line of lines) console.log(`  ${line}`);
	console.log(
		"Each is still a draft under your name: read it before you publish it. bun run bookkit check decides whether it passes.",
	);
	return failed > 0 ? 1 : 0;
}
