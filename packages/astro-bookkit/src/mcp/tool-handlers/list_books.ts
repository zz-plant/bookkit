import { runWorkspaceCommand } from "../command-runner";
import type { ToolHandler } from "./types";

export const handleListBooks: ToolHandler = async ({ options }) => {
	const command = await runWorkspaceCommand(options.workspaceRoot, [
		"run",
		"list:books",
	]);
	if (!command.ok) {
		return {
			ok: false,
			summary: "Unable to list books.",
			error: {
				cause: `list:books failed (exit ${command.exitCode}). ${command.stderr || command.stdout || "No output."}`,
				nextAction:
					"Run bun run list:books locally and fix the reported issue before retrying.",
			},
		};
	}

	const books = command.stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.filter((line) => !line.startsWith("$ "));

	return {
		ok: true,
		summary: `Found ${books.length} books in the workspace.`,
		payload: { books, count: books.length, command: command.command },
	};
};
