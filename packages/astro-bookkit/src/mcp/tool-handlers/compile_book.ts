import { runWorkspaceCommand, tailLines } from "../command-runner";
import { bookArg } from "./book-arg";
import type { ToolHandler } from "./types";

export const handleCompileBook: ToolHandler = async ({ options, args }) => {
	const picked = bookArg(options, args);
	if (!picked.ok) return picked.response;
	const book = picked.book;
	if (!book) {
		return {
			ok: false,
			summary: "Book compilation requires a slug.",
			error: {
				cause: "Missing required arguments.book.",
				nextAction:
					"Call bookkit.list_books to see available slugs, then retry with bookkit.compile_book({ book: '<slug>' }).",
			},
		};
	}

	const command = await runWorkspaceCommand(options.workspaceRoot, [
		"run",
		"compile:book",
		"--",
		"--book",
		book,
	]);

	return {
		ok: command.ok,
		summary: command.ok
			? `Compilation of '${book}' succeeded.`
			: `Compilation of '${book}' failed.`,
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
					cause: `compile:book returned exit code ${command.exitCode}.`,
					nextAction: `Fix the compilation errors reported for '${book}', then re-run bookkit.compile_book({ book: '${book}' }).`,
				},
	};
};
