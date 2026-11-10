import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkAnswer, commandFile } from "./corpus-judgments";
import { askCommand, commandFor, commandLabel } from "./model-command";

/**
 * Asks the judges of a `bookkit judge` request with a command the author
 * chose (model-command.ts): each judge is its own run of the command, in an
 * empty folder of its own, so it sees its prompt and nothing else: not the
 * key, not the other judges, not the repository. A reply that answers every
 * pair is saved as answer-<n>.json, where `bookkit judge record` reads it,
 * and the command beside it as judge-<n>/command.txt, so each vote records
 * which command gave it. Given several commands (one per model, say), judge n
 * is asked with the nth, in turn, so a panel can mix models and
 * `check:corpus --eval` can score each one.
 */

/** The environment variable that names the judge command. */
export const JUDGE_COMMAND_ENV = "BOOKKIT_JUDGE_COMMAND";

export type JudgeResult = {
	judge: number;
	/** The command that asked it, as recorded. */
	command: string;
	/** The answer file written, when the reply answered every pair. */
	answer?: string;
	/** Why it was not, and where the reply was kept. */
	error?: string;
	seconds: number;
};

/** Judges in the request folder that have a prompt and no answer yet. */
export const unansweredJudges = (
	folder: string,
): Array<{ judge: number; prompt: string }> =>
	readdirSync(folder)
		.map((name) => name.match(/^judge-(\d+)$/))
		.filter((match): match is RegExpMatchArray => match !== null)
		.map((match) => ({
			judge: Number(match[1]),
			prompt: join(folder, match[0], "prompt.md"),
		}))
		.filter(
			({ judge, prompt }) =>
				existsSync(prompt) && !existsSync(join(folder, `answer-${judge}.json`)),
		)
		.sort((a, b) => a.judge - b.judge);

/** One judge: the prompt on stdin, the reply from stdout. */
const askOne = async (
	folder: string,
	judge: number,
	prompt: string,
	command: string,
): Promise<JudgeResult> => {
	const label = commandLabel(command);
	const asked = await askCommand(
		command,
		readFileSync(prompt, "utf8"),
		"BOOKKIT_JUDGE_PROMPT",
	);
	const kept = join(folder, `judge-${judge}`, "reply.txt");
	if (asked.error) {
		writeFileSync(kept, asked.output);
		return {
			judge,
			command: label,
			error: `${asked.error} (output in ${kept})`,
			seconds: asked.seconds,
		};
	}
	const { reply, seconds } = asked;
	const file = `answer-${judge}.json`;
	const problem = checkAnswer(folder, reply, file);
	if (problem) {
		writeFileSync(kept, reply);
		return {
			judge,
			command: label,
			error: `${problem} (reply in ${kept})`,
			seconds,
		};
	}
	const answer = join(folder, file);
	writeFileSync(answer, reply.endsWith("\n") ? reply : `${reply}\n`);
	writeFileSync(commandFile(folder, judge), `${label}\n`);
	return { judge, command: label, answer, seconds };
};

/**
 * Asks every judge in the folder that has no answer yet, all at once: judge n
 * with the nth command, in turn.
 */
export const runJudges = (
	folder: string,
	commands: readonly string[],
): Promise<JudgeResult[]> => {
	if (commands.length === 0) throw new Error("No judge command to run.");
	return Promise.all(
		unansweredJudges(folder).map(({ judge, prompt }) =>
			askOne(folder, judge, prompt, commandFor(commands, judge)),
		),
	);
};
