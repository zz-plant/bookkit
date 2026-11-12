import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";
import { repoRoot } from "../../_lib";
import { chapterNamed } from "../chapter-moves";
import {
	type ReviewFinding,
	readReview,
	reviewPrompt,
	ruleName,
} from "../chapter-review";
import { didYouMean, flagValue, positionals } from "../cli";
import {
	briefInputFor,
	type ChapterToDraft,
	chaptersToDraft,
} from "../draft-brief";
import { resolveFromCaller } from "../folder-report";
import { JUDGE_COMMAND_ENV } from "../judge-runner";
import {
	askCommand,
	commandFor,
	commandLabel,
	commandsFrom,
	freshPath,
} from "../model-command";
import { books, takeBook } from "./context";

/**
 * `bookkit review [book] <chapter>`: a written chapter read by judge models
 * against the rules a draft is held to and the contracts of the mechanisms
 * it binds (chapter-review.ts). Each reviewer's prompt and reply are kept
 * under .bookkit/reviewing/, which git ignores; the chapter is not touched.
 * `bookkit finish` runs the same review between its revisions.
 */

const VALUED = ["--judges", "--judge"];

const USAGE =
	'bun run bookkit review [book] <chapter|file.mdx> [--judges <n>] [--judge "<command>"] [--no-run] [--json]';

const shown = (path: string): string => relative(process.cwd(), path) || ".";

/** A chapter file's book, from its path under apps/<book>/. */
export const bookOfFile = (file: string): string | undefined => {
	const parts = relative(join(repoRoot(), "apps"), file).split(sep);
	return parts.length > 1 && !parts[0].startsWith("..") ? parts[0] : undefined;
};

export type Review = {
	reviewer: number;
	command: string;
	seconds: number;
	findings?: ReviewFinding[];
	error?: string;
};

/**
 * Asks `reviewers` reviewers about one chapter as it stands, and keeps the
 * prompt, each reply, and review.json in a folder of its own under
 * .bookkit/reviewing/. With no command, writes the prompt only.
 */
export const runReview = async (
	chapter: ChapterToDraft,
	chapters: ChapterToDraft[],
	commands: readonly string[],
	reviewers: number,
): Promise<{ folder: string; reviews: Review[] }> => {
	const prompt = reviewPrompt(await briefInputFor(chapter, { chapters }));
	const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
	const folder = freshPath(
		join(
			repoRoot(),
			".bookkit",
			"reviewing",
			`${chapter.book}-${chapter.slug}-${stamp}`,
		),
	);
	mkdirSync(folder, { recursive: true });
	writeFileSync(join(folder, "prompt.md"), prompt);
	if (commands.length === 0) return { folder, reviews: [] };
	const reviews: Review[] = await Promise.all(
		Array.from({ length: reviewers }, async (_, index) => {
			const reviewer = index + 1;
			const command = commandFor(commands, reviewer);
			const asked = await askCommand(command, prompt, "BOOKKIT_REVIEW_PROMPT");
			writeFileSync(join(folder, `reply-${reviewer}.txt`), asked.output);
			const read = asked.error
				? { error: asked.error }
				: readReview(asked.reply);
			return {
				reviewer,
				command: commandLabel(command),
				seconds: asked.seconds,
				...("error" in read ? { error: read.error } : read),
			};
		}),
	);
	writeFileSync(
		join(folder, "review.json"),
		`${JSON.stringify(
			{
				book: chapter.book,
				chapter: relative(repoRoot(), chapter.file),
				reviews,
			},
			null,
			"\t",
		)}\n`,
	);
	return { folder, reviews };
};

/** One reviewer's findings, as `review` prints them. */
export const printReview = (folder: string, one: Review): void => {
	const who = `reviewer ${one.reviewer} (${one.command}, ${one.seconds}s)`;
	if (one.error) {
		console.log(
			`  ✗ ${who}: ${one.error} (reply in ${shown(join(folder, `reply-${one.reviewer}.txt`))})`,
		);
		return;
	}
	const findings = one.findings ?? [];
	console.log(
		findings.length === 0
			? `  ✓ ${who}: nothing to change`
			: `  ${who}: ${findings.length} to change`,
	);
	for (const finding of findings) {
		console.log(
			`    · ${ruleName(finding.rule)}${finding.where ? `, ${finding.where}` : ""}: ${finding.what}${finding.fix ? `\n      fix: ${finding.fix}` : ""}`,
		);
	}
};

export async function review(rest: string[]): Promise<number> {
	const judges = rest.includes("--judges")
		? Number(flagValue(rest, "--judges"))
		: 1;
	if (!Number.isInteger(judges) || judges < 1) {
		console.error("--judges needs a whole number of 1 or more.");
		return 1;
	}
	const commands = rest.includes("--no-run")
		? []
		: commandsFrom(rest, "--judge", JUDGE_COMMAND_ENV);
	const named = positionals(rest, VALUED);
	// A path names its own book.
	const path =
		named.length === 1 && /\.mdx?$/.test(named[0])
			? resolveFromCaller(named[0])
			: undefined;
	const [book, [chapterName]] = path
		? [bookOfFile(path) ?? "", [path]]
		: takeBook(named, 1, USAGE);
	if (!books.includes(book)) {
		console.error(
			`${named[0]} is not a chapter of a book under apps/. Usage: ${USAGE}`,
		);
		return 1;
	}
	if (!chapterName) {
		console.error(`Usage: ${USAGE}`);
		return 1;
	}
	const chapters = await chaptersToDraft(book);
	const chapter = path
		? chapters.find((other) => resolve(other.file) === path)
		: chapterNamed(chapters, chapterName);
	if (!chapter) {
		console.error(
			`${book} has no chapter "${chapterName}".${didYouMean(
				basename(chapterName),
				chapters.map((other) => other.slug),
			)}`,
		);
		return 1;
	}
	const file = relative(repoRoot(), chapter.file);
	const { folder, reviews } = await runReview(
		chapter,
		chapters,
		commands,
		judges,
	);
	if (commands.length === 0) {
		console.log(
			`${file}: the reviewer's prompt is ${shown(join(folder, "prompt.md"))}. Give it to a model in a session of its own; it replies with JSON findings.\nTo have bookkit ask: set ${JUDGE_COMMAND_ENV}, or pass --judge "<command>".`,
		);
		return 0;
	}
	if (rest.includes("--json")) {
		console.log(JSON.stringify({ book, chapter: file, reviews }, null, 2));
		return reviews.some((one) => one.error) ? 1 : 0;
	}
	console.log(`\n${file}: read by ${judges} reviewer(s).`);
	for (const one of reviews) printReview(folder, one);
	console.log(
		"\nA review is advice: bun run bookkit check decides whether the chapter passes.",
	);
	return reviews.some((one) => one.error) ? 1 : 0;
}
