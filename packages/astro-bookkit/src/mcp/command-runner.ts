type SpawnSync = typeof import("node:child_process").spawnSync;

/**
 * spawnSync where the runtime has child processes, else null. Looked up when a
 * command runs, not with a top-level `await import()`: under Bun 1.3 a test
 * could call a handler before that await settled, and fail with "Cannot access
 * 'runWorkspaceCommand' before initialization" whenever no earlier test file
 * had loaded this module.
 */
const loadSpawnSync = (): SpawnSync | null => {
	try {
		const mod = (
			process as {
				getBuiltinModule?: (
					id: string,
				) => typeof import("node:child_process") | undefined;
			}
		).getBuiltinModule?.("node:child_process");
		return mod?.spawnSync ?? null;
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

export const runWorkspaceCommand = (
	workspaceRoot: string | undefined,
	args: string[],
): WorkspaceCommandResult => {
	const spawnSyncFn = loadSpawnSync();
	if (!spawnSyncFn) return UNSUPPORTED_ERROR;

	const cwd = workspaceRoot ?? process.cwd();
	const result = spawnSyncFn("bun", args, {
		cwd,
		// Explicit: Bun 1.3 hands a child the environment it started with,
		// not later changes to process.env.
		env: process.env,
		encoding: "utf8",
		timeout: 10 * 60 * 1000,
	});

	return {
		ok: result.status === 0,
		command: `bun ${args.join(" ")}`,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
		exitCode: result.status ?? -1,
	};
};
