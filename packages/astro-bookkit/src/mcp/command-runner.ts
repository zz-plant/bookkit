type ChildProcessModule = typeof import("node:child_process");

/**
 * node:child_process where the runtime has child processes, else null. Looked
 * up when a command runs, not with a top-level `await import()`: under Bun 1.3
 * a test could call a handler before that await settled, and fail with
 * "Cannot access 'runWorkspaceCommand' before initialization" whenever no
 * earlier test file had loaded this module.
 */
const loadChildProcess = (): ChildProcessModule | null => {
	try {
		return (
			(
				process as {
					getBuiltinModule?: (id: string) => ChildProcessModule | undefined;
				}
			).getBuiltinModule?.("node:child_process") ?? null
		);
	} catch {
		return null;
	}
};

export type WorkspaceCommandResult = {
	ok: boolean;
	command: string;
	stdout: string;
	stderr: string;
	exitCode: number;
};

const UNSUPPORTED_ERROR: WorkspaceCommandResult = {
	ok: false,
	command: "",
	stdout: "",
	stderr:
		"Child process spawning is unavailable in this runtime. Use in-memory validators instead.",
	exitCode: -1,
};

const TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Runs `bun <args>` in the workspace without blocking: while a build runs,
 * the server still answers other requests (a ping, a read).
 */
export const runWorkspaceCommand = (
	workspaceRoot: string | undefined,
	args: string[],
): Promise<WorkspaceCommandResult> => {
	const childProcess = loadChildProcess();
	if (!childProcess) return Promise.resolve(UNSUPPORTED_ERROR);
	const command = `bun ${args.join(" ")}`;
	return new Promise((resolve) => {
		const child = childProcess.spawn("bun", args, {
			cwd: workspaceRoot ?? process.cwd(),
			// Explicit: Bun 1.3 hands a child the environment it started with,
			// not later changes to process.env.
			env: process.env,
		});
		let stdout = "";
		let stderr = "";
		child.stdout?.setEncoding("utf8");
		child.stderr?.setEncoding("utf8");
		child.stdout?.on("data", (chunk: string) => {
			stdout += chunk;
		});
		child.stderr?.on("data", (chunk: string) => {
			stderr += chunk;
		});
		const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
		child.once("error", (error) => {
			clearTimeout(timer);
			resolve({
				ok: false,
				command,
				stdout,
				stderr: `${stderr}${error.message}`,
				exitCode: -1,
			});
		});
		child.once("close", (code) => {
			clearTimeout(timer);
			resolve({
				ok: code === 0,
				command,
				stdout,
				stderr,
				exitCode: code ?? -1,
			});
		});
	});
};

/** The last lines of a command's output: enough to act on, small enough for an agent's context. */
export const tailLines = (text: string, lines = 40): string => {
	const all = text.trim().split("\n");
	return all.length <= lines
		? all.join("\n")
		: [
				`… ${all.length - lines} earlier line(s) left out`,
				...all.slice(-lines),
			].join("\n");
};
