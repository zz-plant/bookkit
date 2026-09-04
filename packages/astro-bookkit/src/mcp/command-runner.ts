let spawnSyncFn: typeof import("node:child_process").spawnSync | null = null;

try {
	const mod = await import("node:child_process");
	spawnSyncFn = mod.spawnSync;
} catch {
	spawnSyncFn = null;
}

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
	if (!spawnSyncFn) return UNSUPPORTED_ERROR;

	const cwd = workspaceRoot ?? process.cwd();
	const result = spawnSyncFn("bun", args, {
		cwd,
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
