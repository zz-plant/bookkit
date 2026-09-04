import { validateBookInMemory } from "../../validators/book-validator";
import {
	missingBookSlugError,
	validateBookCommandFailedError,
} from "../../validators/governance-errors";
import { runWorkspaceCommand } from "../command-runner";
import type { ToolHandler } from "./types";

export const toValidateBookFailure = (exitCode: number) => {
	const normalized = validateBookCommandFailedError(exitCode);
	return {
		cause: normalized.humanSummary,
		...normalized,
	};
};

export const handleValidateBook: ToolHandler = ({ options, args }) => {
	const rawBook = args?.book;
	const book =
		typeof rawBook === "string" && rawBook.trim().length
			? rawBook.trim()
			: options.bookSlug;
	if (!book) {
		const normalized = missingBookSlugError();
		return {
			ok: false,
			summary: normalized.humanSummary,
			error: {
				cause: normalized.humanSummary,
				...normalized,
			},
		};
	}

	const inMemoryDiagnostics = validateBookInMemory({
		workspaceRoot: options.workspaceRoot,
		bookSlug: book,
	});

	const command = runWorkspaceCommand(options.workspaceRoot, [
		"run",
		"validate:book",
		"--",
		"--book",
		book,
	]);
	return {
		ok: command.ok,
		summary: command.ok
			? `Validation passed for ${book}.`
			: `Validation failed for ${book}.`,
		payload: {
			book,
			command: command.command,
			exitCode: command.exitCode,
			stdout: command.stdout.trim(),
			stderr: command.stderr.trim(),
			diagnostics: {
				errors: inMemoryDiagnostics.errors,
				warnings: inMemoryDiagnostics.warnings,
			},
		},
		error: command.ok ? undefined : toValidateBookFailure(command.exitCode),
	};
};
