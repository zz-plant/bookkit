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

type ValidateReport = {
	ok: boolean;
	findings: Array<{
		level: "error" | "warning";
		code?: string;
		field?: string;
		message: string;
		file?: string;
		fix?: string;
	}>;
};

const parseValidateReport = (stdout: string): ValidateReport | null => {
	try {
		const parsed = JSON.parse(stdout) as ValidateReport;
		return Array.isArray(parsed.findings) ? parsed : null;
	} catch {
		return null;
	}
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
		"--json",
	]);
	// Judge by the findings: validate-book exits 0 in warn mode even with errors.
	const report = parseValidateReport(command.stdout);
	const errorCount =
		report?.findings.filter((finding) => finding.level === "error").length ?? 0;
	const ok = command.ok && report !== null && errorCount === 0;
	return {
		ok,
		summary: ok
			? `Validation passed for ${book}${report?.findings.length ? ` (${report.findings.length} warning(s))` : ""}.`
			: report
				? `Validation failed for ${book}: ${errorCount} error(s). Each finding names its file, field, and fix; check a corrected file with bookkit.check_content before writing it.`
				: `Validation failed for ${book}.`,
		payload: {
			book,
			command: command.command,
			exitCode: command.exitCode,
			findings: report?.findings ?? [],
			stderr: command.stderr.trim() || undefined,
			stdout: report ? undefined : command.stdout.trim(),
			diagnostics: {
				errors: inMemoryDiagnostics.errors,
				warnings: inMemoryDiagnostics.warnings,
			},
		},
		error: ok
			? undefined
			: {
					...toValidateBookFailure(command.exitCode),
					...(report
						? { cause: `${errorCount} validation error(s) in ${book}.` }
						: {}),
				},
	};
};
