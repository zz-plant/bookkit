import {
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkAnswer } from "./corpus-judgments";

/**
 * Asks the judges of a `bookkit judge` request with a command the author
 * chose: any program that reads a prompt on stdin and prints its reply, such
 * as an LLM's command-line tool. Each judge is its own run of the command, in
 * an empty folder of its own, so it sees its prompt and nothing else: not the
 * key, not the other judges, not the repository. A reply that answers every
 * pair is saved as answer-<n>.json, where `bookkit judge record` reads it.
 */

/** The environment variable that names the judge command. */
export const JUDGE_COMMAND_ENV = "BOOKKIT_JUDGE_COMMAND";

/** How long one judge may take before it is stopped. */
const TIMEOUT_MS = 10 * 60 * 1000;

export type JudgeResult = {
	judge: number;
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

const shell = (command: string): string[] =>
	process.platform === "win32"
		? ["cmd", "/d", "/s", "/c", command]
		: ["sh", "-c", command];

/** One judge: the prompt on stdin, the reply from stdout. */
const askOne = async (
	folder: string,
	judge: number,
	prompt: string,
	command: string,
): Promise<JudgeResult> => {
	const started = Date.now();
	const seconds = () => Math.round((Date.now() - started) / 1000);
	const text = readFileSync(prompt, "utf8");
	// An empty folder, so a judge that can read files finds nothing to read.
	const room = mkdtempSync(join(tmpdir(), "bookkit-judge-"));
	try {
		const roomPrompt = join(room, "prompt.md");
		writeFileSync(roomPrompt, text);
		const child = Bun.spawn(shell(command), {
			cwd: room,
			env: { ...process.env, BOOKKIT_JUDGE_PROMPT: roomPrompt },
			stdin: new TextEncoder().encode(text),
			stdout: "pipe",
			stderr: "pipe",
		});
		const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
		const [reply, errors, code] = await Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
			child.exited,
		]);
		clearTimeout(timer);
		const kept = join(folder, `judge-${judge}`, "reply.txt");
		if (code !== 0) {
			writeFileSync(kept, `${reply}${errors}`);
			return {
				judge,
				error: `the command exited with ${child.signalCode ?? code}${errors.trim() ? `: ${errors.trim().split("\n").pop()}` : ""} (output in ${kept})`,
				seconds: seconds(),
			};
		}
		const file = `answer-${judge}.json`;
		const problem = checkAnswer(folder, reply, file);
		if (problem) {
			writeFileSync(kept, reply);
			return {
				judge,
				error: `${problem} (reply in ${kept})`,
				seconds: seconds(),
			};
		}
		const answer = join(folder, file);
		writeFileSync(answer, reply.endsWith("\n") ? reply : `${reply}\n`);
		return { judge, answer, seconds: seconds() };
	} finally {
		rmSync(room, { recursive: true, force: true });
	}
};

/** Asks every judge in the folder that has no answer yet, all at once. */
export const runJudges = (
	folder: string,
	command: string,
): Promise<JudgeResult[]> =>
	Promise.all(
		unansweredJudges(folder).map(({ judge, prompt }) =>
			askOne(folder, judge, prompt, command),
		),
	);
