import { runWorkspaceCommand, tailLines } from "../command-runner";
import { bookArg } from "./book-arg";
import type { ToolHandler } from "./types";

const FORMAT_FLAGS: Record<string, string> = {
	skills: "--skills",
	json: "--json",
	rubric: "--rubric",
};

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

	const format = typeof args?.format === "string" ? args.format : "gitbook";
	if (format !== "gitbook" && !(format in FORMAT_FLAGS)) {
		return {
			ok: false,
			summary: `Unsupported export format '${format}'.`,
			error: {
				cause: `format must be one of gitbook, skills, json, rubric (got '${format}').`,
				nextAction:
					"Retry bookkit.export_book with format 'gitbook', 'skills', 'json', or 'rubric'.",
			},
		};
	}

	const cmdArgs =
		format === "gitbook"
			? ["run", "export:gitbook", "--", "--book", book]
			: ["run", "bookkit", "export", book, FORMAT_FLAGS[format]];
	const command = await runWorkspaceCommand(options.workspaceRoot, cmdArgs);

	return {
		ok: command.ok,
		summary: command.ok
			? `Export (${format}) of '${book}' succeeded.`
			: `Export (${format}) of '${book}' failed.`,
		payload: {
			book,
			format,
			command: command.command,
			exitCode: command.exitCode,
			// The end of the output, where the result and any error are.
			stdout: tailLines(command.stdout),
			stderr: tailLines(command.stderr),
		},
		error: command.ok
			? undefined
			: {
					cause: `${format} export returned exit code ${command.exitCode}.`,
					nextAction: `Fix the export errors reported for '${book}' (for example missing content or config), then re-run bookkit.export_book({ book: '${book}', format: '${format}' }).`,
				},
	};
};
