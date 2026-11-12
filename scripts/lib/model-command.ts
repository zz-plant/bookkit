import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * A model as bookkit asks one: any program that reads a prompt on stdin and
 * prints its reply, such as an LLM's command-line tool. `bookkit judge` asks
 * its judges this way (judge-runner.ts), and `bookkit draft` its writers and
 * judges (draft-run.ts). Each run is in an empty folder of its own, so a
 * model that can read files sees its prompt and nothing else: not the
 * repository, not the other runs.
 */

/**
 * The command as a record keeps it: without leading NAME=value assignments,
 * which can hold keys. Anything else in the command is kept, so pass secrets
 * through the environment.
 */
export const commandLabel = (command: string): string =>
	command
		.trim()
		.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=(?:'[^']*'|"[^"]*"|\S*)\s+)+/, "");

/** Commands from a repeatable flag or an environment variable, one per line. */
export const splitCommands = (value: string | undefined): string[] =>
	(value ?? "")
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);

/**
 * The commands a run uses: every `flag "<command>"` in `rest`, else the
 * environment variable's, one per line. With several, the nth run is asked
 * with the nth, in turn (see commandFor).
 */
export const commandsFrom = (
	rest: readonly string[],
	flag: string,
	env: string,
): string[] => {
	const passed = rest.flatMap((arg, index) =>
		arg === flag && rest[index + 1] && !rest[index + 1].startsWith("--")
			? [rest[index + 1]]
			: [],
	);
	return passed.length > 0 ? passed : splitCommands(process.env[env]);
};

/** The command for the nth run (from 1), taking the commands in turn. */
export const commandFor = (commands: readonly string[], n: number): string =>
	commands[(n - 1) % commands.length];

/** How long one run may take before it is stopped, unless the caller says. */
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

const shell = (command: string): string[] =>
	process.platform === "win32"
		? ["cmd", "/d", "/s", "/c", command]
		: ["sh", "-c", command];

/** The processes `pid` started, and theirs, deepest first. */
const descendants = (pid: number): number[] => {
	let found: string;
	try {
		found = Bun.spawnSync(["pgrep", "-P", String(pid)]).stdout.toString();
	} catch {
		return []; // no pgrep: only the shell is stopped
	}
	return found
		.split("\n")
		.map(Number)
		.filter((child) => child > 0)
		.flatMap((child) => [...descendants(child), child]);
};

/**
 * Stops a command and everything it started. Stopping only the shell leaves
 * the program it runs (`sleep 20; true`, `ollama run … | tee`, and on Linux
 * often a lone `sleep 20`) still running, still holding the output pipe
 * open, so the reply is not read until that program ends on its own. The
 * processes stay in bookkit's process group, so Ctrl-C still reaches them.
 * On Windows only cmd is stopped, as before.
 */
const stop = (child: { pid: number; kill: () => void }) => {
	if (process.platform !== "win32") {
		for (const pid of descendants(child.pid)) {
			try {
				process.kill(pid, "SIGTERM");
			} catch {
				// it ended between the listing and the signal
			}
		}
	}
	child.kill();
};

/**
 * Output without what a terminal would have drawn: cursor and colour codes,
 * and the frames of a spinner. A command-line tool that shows progress
 * (ollama run does, on stderr) writes thousands of them while a model loads.
 */
export const plainOutput = (text: string): string =>
	text
		// biome-ignore lint/suspicious/noControlCharactersInRegex: the escape character is what is being removed
		.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "")
		.replace(/[\u2800-\u28ff]\s?/g, "")
		.replace(/\r(?!\n)/g, "");

/** A line short enough to print: an error's last line can be a megabyte of progress. */
const clipped = (line: string, limit = 200): string =>
	line.length > limit ? `${line.slice(0, limit)}…` : line;

export type CommandReply = {
	/** What the command printed. */
	reply: string;
	/** Why it failed: stopped at the time limit, or its exit code and the last line of stderr. */
	error?: string;
	/** stdout and stderr together, for a failed run's kept output. */
	output: string;
	seconds: number;
};

/**
 * One run of `command`: the prompt on stdin, the reply from stdout. The
 * prompt is also a file in the run's folder, named in `promptEnv`, for a
 * command that takes a path.
 */
export const askCommand = async (
	command: string,
	prompt: string,
	promptEnv: string,
	timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<CommandReply> => {
	const started = Date.now();
	// An empty folder, so a model that can read files finds nothing to read.
	const room = mkdtempSync(join(tmpdir(), "bookkit-model-"));
	try {
		const roomPrompt = join(room, "prompt.md");
		writeFileSync(roomPrompt, prompt);
		const child = Bun.spawn(shell(command), {
			cwd: room,
			env: { ...process.env, [promptEnv]: roomPrompt },
			stdin: new TextEncoder().encode(prompt),
			stdout: "pipe",
			stderr: "pipe",
		});
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			stop(child);
		}, timeoutMs);
		const [stdout, stderr, code] = await Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
			child.exited,
		]);
		clearTimeout(timer);
		const reply = plainOutput(stdout);
		const errors = plainOutput(stderr);
		const seconds = Math.round((Date.now() - started) / 1000);
		if (code === 0) return { reply, output: reply, seconds };
		const last = errors.trim().split("\n").pop();
		return {
			reply,
			output: `${reply}${errors}`,
			error: timedOut
				? `it had not finished after ${Math.round(timeoutMs / 1000)} s and was stopped`
				: `the command exited with ${child.signalCode ?? code}${last ? `: ${clipped(last)}` : ""}`,
			seconds,
		};
	} finally {
		rmSync(room, { recursive: true, force: true });
	}
};

/**
 * Runs `tasks` with at most `limit` going at once, and gives their results
 * in the tasks' order. Commands that share one local model server wait on
 * each other while their time limits run, so the caller decides how many.
 */
export const inTurn = async <T>(
	tasks: ReadonlyArray<() => Promise<T>>,
	limit: number,
): Promise<T[]> => {
	const results: T[] = new Array(tasks.length);
	let next = 0;
	const worker = async () => {
		while (next < tasks.length) {
			const index = next;
			next += 1;
			results[index] = await tasks[index]();
		}
	};
	await Promise.all(
		Array.from({ length: Math.max(1, Math.min(limit, tasks.length)) }, worker),
	);
	return results;
};

/**
 * The JSON object (or array) in a model's reply, or undefined when there is
 * none: the text from its first `{` to its last `}` (`[` and `]` for an
 * array), since models wrap JSON in prose and code fences. Every reader of a
 * model's reply (ballots, reviews, definitions, judges' answers) starts here.
 */
export const jsonInReply = (
	text: string,
	shape: "object" | "array" = "object",
): unknown => {
	const [open, close] = shape === "object" ? ["{", "}"] : ["[", "]"];
	const start = text.indexOf(open);
	const end = text.lastIndexOf(close);
	if (start < 0 || end < start) return undefined;
	try {
		const parsed: unknown = JSON.parse(text.slice(start, end + 1));
		const isArray = Array.isArray(parsed);
		if (typeof parsed !== "object" || parsed === null) return undefined;
		return (shape === "array") === isArray ? parsed : undefined;
	} catch {
		return undefined;
	}
};

/** `base`, else `base-2`, `base-3`, and on: the first path that does not exist yet. */
export const freshPath = (base: string): string => {
	let path = base;
	for (let n = 2; existsSync(path); n += 1) path = `${base}-${n}`;
	return path;
};
