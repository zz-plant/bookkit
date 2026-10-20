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

/** No command a test runs takes this long, even on a loaded machine; a build has its own. */
export const CHILD_DEADLINE_MS = 60_000;

/** An Astro build of a book: about 4 s idle, and many times that beside other builds. */
export const BUILD_DEADLINE_MS = 180_000;

/** Per test: a hung child is killed and reported before the runner gives up. */
export const CHILD_TEST_TIMEOUT_MS = 2 * CHILD_DEADLINE_MS;

/** Call once at the top of a test file whose tests wait for child processes. */
export const waitForChildren = () => setDefaultTimeout(CHILD_TEST_TIMEOUT_MS);

type ChildOptions = {
	cwd?: string;
	env?: Record<string, string | undefined>;
	stdin?: string;
	/** CHILD_DEADLINE_MS, or BUILD_DEADLINE_MS for a build. */
	deadlineMs?: number;
};

export type ChildResult = {
	status: number | null;
	stdout: string;
	stderr: string;
	/** stdout, then stderr. */
	output: string;
};

/** Names the command, and keeps what it printed before it was killed. */
const killed = (command: string[], deadlineMs: number, output: string) =>
	new Error(
		`${command.join(" ")} was still running after ${deadlineMs / 1000} s and was killed.${output ? `\n${output}` : ""}`,
	);

const result = (stdout: string, stderr: string, status: number | null) => ({
	status,
	stdout,
	stderr,
	output: `${stdout}${stderr}`,
});

/** Runs `command` to completion; throws if it outlives its deadline. */
export const runChild = (
	command: string[],
	options: ChildOptions = {},
): ChildResult => {
	const deadlineMs = options.deadlineMs ?? CHILD_DEADLINE_MS;
	const child = Bun.spawnSync(command, {
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
	const done = result(
		child.stdout.toString(),
		child.stderr.toString(),
		child.exitCode,
	);
	if (child.exitedDueToTimeout) throw killed(command, deadlineMs, done.output);
	return done;
};

/**
 * `runChild` without blocking the test's worker, for children that run side
 * by side or that a test answers while they run (a server it starts).
 */
export const runChildAsync = async (
	command: string[],
	options: ChildOptions = {},
): Promise<ChildResult> => {
	const deadlineMs = options.deadlineMs ?? CHILD_DEADLINE_MS;
	const child = Bun.spawn(command, {
		cwd: options.cwd,
		env: options.env,
		stdin: options.stdin === undefined ? "ignore" : Buffer.from(options.stdin),
		stdout: "pipe",
		stderr: "pipe",
	});
	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		child.kill("SIGKILL");
	}, deadlineMs);
	try {
		const [stdout, stderr, status] = await Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
			child.exited,
		]);
		const done = result(stdout, stderr, status);
		if (timedOut) throw killed(command, deadlineMs, done.output);
		return done;
	} finally {
		clearTimeout(timer);
	}
};
