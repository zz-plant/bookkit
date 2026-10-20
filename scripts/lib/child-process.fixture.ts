import { setDefaultTimeout } from "bun:test";

/**
 * For tests that run a bookkit script, git, or a shell as a child process and
 * wait for it to exit.
 *
 * How long a child takes depends on what else wants the CPU. `bun test
 * --parallel` runs a worker per core, and several of them build a book at the
 * same time; a build, a verify, or a second suite may be running too. Under
 * that load, `bun run validate` over three small books went from 1 s to 7 s,
 * and the runner's 5 s default failed tests that were only waiting. That
 * default never caught a hang either: Bun.spawnSync blocks the test's worker,
 * so the runner can fail the test only after the child has exited.
 *
 * So the deadline belongs to the child: it is killed after CHILD_DEADLINE_MS
 * and the test fails naming the command. A file whose tests run children
 * calls `waitForChildren()`, which gives each test room for a few of them.
 */

/** No command a test runs takes this long, even on a loaded machine; a builder's own tests set their own. */
export const CHILD_DEADLINE_MS = 60_000;

/** Per test: a hung child is killed and reported before the runner gives up. */
export const CHILD_TEST_TIMEOUT_MS = 2 * CHILD_DEADLINE_MS;

/** Call once at the top of a test file whose tests wait for child processes. */
export const waitForChildren = () => setDefaultTimeout(CHILD_TEST_TIMEOUT_MS);

export type ChildResult = {
	status: number | null;
	stdout: string;
	stderr: string;
	/** stdout, then stderr. */
	output: string;
};

/** Runs `command` to completion; throws if it outlives its deadline. */
export const runChild = (
	command: string[],
	options: {
		cwd?: string;
		env?: Record<string, string | undefined>;
		stdin?: string;
		/** CHILD_DEADLINE_MS unless a test of the deadline itself says otherwise. */
		deadlineMs?: number;
	} = {},
): ChildResult => {
	const deadlineMs = options.deadlineMs ?? CHILD_DEADLINE_MS;
	const result = Bun.spawnSync(command, {
		cwd: options.cwd,
		env: options.env,
		...(options.stdin === undefined
			? {}
			: { stdin: Buffer.from(options.stdin) }),
		stdout: "pipe",
		stderr: "pipe",
		timeout: deadlineMs,
		killSignal: "SIGKILL",
	});
	if (result.exitedDueToTimeout) {
		throw new Error(
			`${command.join(" ")} was still running after ${deadlineMs / 1000} s and was killed.`,
		);
	}
	const stdout = result.stdout.toString();
	const stderr = result.stderr.toString();
	return {
		status: result.exitCode,
		stdout,
		stderr,
		output: `${stdout}${stderr}`,
	};
};
