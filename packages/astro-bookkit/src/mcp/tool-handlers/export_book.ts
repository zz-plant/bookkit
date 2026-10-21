import { runWorkspaceCommand, tailLines } from "../command-runner";
import { bookArg } from "./book-arg";
import type { ToolHandler } from "./types";

export const handleExportBook: ToolHandler = async ({ options, args }) => {
	const picked = bookArg(options, args);
	if (!picked.ok) return picked.response;
	const book = picked.book;
	if (!book) {
		return {
			ok: false,
			summary: "Book export requires a slug.",
			error: {
				cause: "Missing required arguments.book.",
				nextAction:
					"Call bookkit.list_books to see available slugs, then retry with bookkit.export_book({ book: '<slug>' }).",
			},
		};
	}

	const command = await runWorkspaceCommand(options.workspaceRoot, [
		"run",
		"export:gitbook",
		"--",
		"--book",
		book,
	]);

	return {
		ok: command.ok,
		summary: command.ok
			? `Export of '${book}' succeeded.`
			: `Export of '${book}' failed.`,
		payload: {
			book,
			command: command.command,
			exitCode: command.exitCode,
			// The end of the output, where the result and any error are.
			stdout: tailLines(command.stdout),
			stderr: tailLines(command.stderr),
		},
		error: command.ok
			? undefined
			: {
					cause: `export:gitbook returned exit code ${command.exitCode}.`,
					nextAction: `Fix the export errors reported for '${book}' (for example missing content or config), then re-run bookkit.export_book({ book: '${book}' }).`,
				},
	};
};
