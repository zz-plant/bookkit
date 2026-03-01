import { runWorkspaceCommand } from "../command-runner";
import type { ToolHandler } from "./types";

export const handleCheckSeparation: ToolHandler = ({ options }) => {
  const command = runWorkspaceCommand(options.workspaceRoot, ["run", "check:separation"]);

  return {
    ok: command.ok,
    summary: command.ok ? "Separation checks passed." : "Separation checks failed.",
    payload: {
      command: command.command,
      exitCode: command.exitCode,
      stdout: command.stdout.trim(),
      stderr: command.stderr.trim(),
    },
    error: command.ok
      ? undefined
      : {
          cause: `check:separation returned exit code ${command.exitCode}.`,
          nextAction: "Resolve boundary violations, then re-run bun run check:separation.",
        },
  };
};
