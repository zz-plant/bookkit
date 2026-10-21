import { runWorkspaceCommand, tailLines } from "../command-runner";
import type { ToolHandler } from "./types";

/** The slug new:book makes from a name: lowercase words joined by hyphens. */
const toSlug = (raw: string): string =>
	raw
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "");

export const handleCreateBook: ToolHandler = async ({ options, args }) => {
	const rawBook = args?.book;
	const named = typeof rawBook === "string" ? rawBook.trim() : "";
	const book = toSlug(named);

	if (!book) {
		return {
			ok: false,
			summary: "Book creation requires a slug.",
			error: {
				cause: named
					? `"${named}" has no letters or digits to make a slug from.`
					: "Missing required arguments.book.",
				nextAction:
					'Provide arguments.book (for example "field-notes", or a title such as "Field Notes") and rerun bookkit.create_book.',
			},
		};
	}

	// A name that is not already a slug ("Field Notes") is the title, unless
	// one is given.
	const rawTitle = args?.title;
	const title =
		typeof rawTitle === "string" && rawTitle.trim().length
			? rawTitle.trim()
			: named !== book
				? named
				: null;
	const frame =
		typeof args?.frame === "string" && args.frame.trim()
			? args.frame.trim()
			: null;

	const commandArgs = ["run", "new:book", "--", "--book", book];
	if (title) commandArgs.push("--title", title);
	if (frame) commandArgs.push("--frame", frame);

	const command = await runWorkspaceCommand(options.workspaceRoot, commandArgs);

	return {
		ok: command.ok,
		summary: command.ok
			? `Created book ${book} in apps/${book}.`
			: `Failed to create book ${book}.`,
		payload: {
			book,
			title,
			frame,
			command: command.command,
			exitCode: command.exitCode,
			stdout: tailLines(command.stdout),
			stderr: tailLines(command.stderr),
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
