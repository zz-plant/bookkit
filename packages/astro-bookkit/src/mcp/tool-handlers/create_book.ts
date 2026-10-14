import { runWorkspaceCommand } from "../command-runner";
import type { ToolHandler } from "./types";

export const handleCreateBook: ToolHandler = ({ options, args }) => {
	const rawBook = args?.book;
	const book = typeof rawBook === "string" ? rawBook.trim() : "";

	if (!book) {
		return {
			ok: false,
			summary: "Book creation requires a slug.",
			error: {
				cause: "Missing required arguments.book.",
				nextAction:
					'Provide arguments.book (for example "my-book") and rerun bookkit.create_book.',
			},
		};
	}

	const rawTitle = args?.title;
	const title =
		typeof rawTitle === "string" && rawTitle.trim().length
			? rawTitle.trim()
			: null;

	const commandArgs = ["run", "new:book", "--", "--book", book];
	if (title) commandArgs.push("--title", title);

	const command = runWorkspaceCommand(options.workspaceRoot, commandArgs);

	return {
		ok: command.ok,
		summary: command.ok
			? `Created book ${book}.`
			: `Failed to create book ${book}.`,
		payload: {
			book,
			title,
			command: command.command,
			exitCode: command.exitCode,
			stdout: command.stdout.trim(),
			stderr: command.stderr.trim(),
		},
		error: command.ok
			? undefined
			: {
					cause: `new:book returned exit code ${command.exitCode}.`,
					nextAction:
						"Resolve scaffold errors (for example duplicate app slug), then rerun bun run new:book -- --book <slug>.",
				},
	};
};
