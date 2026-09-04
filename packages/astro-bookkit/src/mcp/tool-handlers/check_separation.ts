import { separationCommandFailedError } from "../../validators/governance-errors";
import { runWorkspaceCommand } from "../command-runner";
import type { ToolHandler } from "./types";

export const toCheckSeparationFailure = (exitCode: number) => {
	const normalized = separationCommandFailedError(exitCode);
	return {
		cause: normalized.humanSummary,
		...normalized,
	};
};

export const handleCheckSeparation: ToolHandler = ({ options }) => {
	const command = runWorkspaceCommand(options.workspaceRoot, [
		"run",
		"check:separation",
	]);

	return {
		ok: command.ok,
		summary: command.ok
			? "Separation checks passed."
			: "Separation checks failed.",
		payload: {
			command: command.command,
			exitCode: command.exitCode,
			stdout: command.stdout.trim(),
			stderr: command.stderr.trim(),
		},
		error: command.ok ? undefined : toCheckSeparationFailure(command.exitCode),
	};
};
