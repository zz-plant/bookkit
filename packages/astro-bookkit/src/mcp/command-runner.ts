import { spawnSync } from "node:child_process";

export type WorkspaceCommandResult = {
  ok: boolean;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
};

export const runWorkspaceCommand = (
  workspaceRoot: string | undefined,
  args: string[],
): WorkspaceCommandResult => {
  const cwd = workspaceRoot ?? process.cwd();
  const result = spawnSync("bun", args, {
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
