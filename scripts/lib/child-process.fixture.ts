import { setDefaultTimeout } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import {
	insideScratchWorkspace,
	SCRATCH_WORKSPACE_ENV,
} from "../../packages/astro-bookkit/src/utils/scratch-workspace";

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
 *
 * A child started in a scratch workspace (book-workspace.fixture.ts) is told
 * so, and is not started once the workspace has lost its marker; see
 * `childEnv`.
 */

/** No command a test runs takes this long, even on a loaded machine; a build has its own. */
export const CHILD_DEADLINE_MS = 60_000;

/** An Astro build of a book: about 4 s idle, 8 s with three at once beside 10 busy loops. */
export const BUILD_DEADLINE_MS = 180_000;

/** Per test: a hung child is killed and reported before the runner gives up. */
export const CHILD_TEST_TIMEOUT_MS = 2 * CHILD_DEADLINE_MS;

/** Call once at the top of a test file whose tests wait for child processes. */
export const waitForChildren = () => setDefaultTimeout(CHILD_TEST_TIMEOUT_MS);

/** Where book-workspace.fixture.ts makes scratch workspaces (gitignored). */
export const SCRATCH_WORKSPACES = join(
	realpathSync(join(import.meta.dir, "..", "..")),
	".test-workspaces",
);

/**
 * Where a test sends a build's `--outDir` (gitignored). Astro moves build
 * output into the outDir with rename(2), which cannot cross devices: the
 * Linux CI runners keep /tmp on its own device, as do machines with /tmp on
 * tmpfs, so a build's outDir stays on the repository's own filesystem.
 */
export const SCRATCH_BUILDS = join(
	realpathSync(join(import.meta.dir, "..", "..")),
	".test-builds",
);

/** A fresh `--outDir` for a build, under SCRATCH_BUILDS. */
export const scratchBuildDir = (prefix: string): string => {
	mkdirSync(SCRATCH_BUILDS, { recursive: true });
	return mkdtempSync(join(SCRATCH_BUILDS, prefix));
};

/** The scratch workspace `path` is in, or undefined if it is in none. */
export const scratchWorkspaceOf = (path: string): string | undefined => {
	const rel = relative(SCRATCH_WORKSPACES, resolve(path));
	const [name] = rel.split(sep);
	if (!rel || isAbsolute(rel) || name === "..") return undefined;
	return join(SCRATCH_WORKSPACES, name);
};

type Env = Record<string, string | undefined>;

/**
 * The environment for a child run in `cwd`: `env` (else this process's),
 * and in a scratch workspace its folder in SCRATCH_WORKSPACE_ENV, so the
 * child's scripts resolve nothing outside it. Throws, starting nothing, if
 * that workspace has lost its marker: it was deleted.
 */
export const childEnv = (
	cwd: string | undefined,
	env?: Env,
): Env | undefined => {
	if (!cwd) return env;
	// PWD names where the child starts, as a shell would set it. When that
	// folder is deleted mid-run, macOS fails process.cwd() outright (see
	// repoRoot in scripts/_lib.ts), and PWD is what names the gone folder.
	const withPwd = { ...(env ?? process.env), PWD: cwd };
	const workspace = scratchWorkspaceOf(cwd);
	if (!workspace) return withPwd;
	insideScratchWorkspace(workspace, cwd);
	return { ...withPwd, [SCRATCH_WORKSPACE_ENV]: workspace };
};

type ChildOptions = {
	cwd?: string;
	env?: Env;
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
		env: childEnv(options.cwd, options.env),
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
		env: childEnv(options.cwd, options.env),
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
