import { checkBookContent } from "../../validators/book-validator";
import {
	missingBookSlugError,
	validateBookFailedError,
} from "../../validators/governance-errors";
import type { ToolHandler } from "./types";

/**
 * Validates a book in-process with the same checker as `bun run validate`:
 * each finding has a code, the field, a fix, and its file.
 */
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

	const workspaceRoot = options.workspaceRoot ?? process.cwd();
	const result = checkBookContent({
		workspaceRoot,
		bookSlug: book,
		releaseMode: args?.releaseMode === true,
	});
	const errorCount = result.findings.filter(
		(finding) => finding.level === "error",
	).length;
	const warningCount = result.findings.length - errorCount;
	const findings = result.findings.map((finding) => ({
		...finding,
		file: finding.file?.startsWith(`${workspaceRoot}/`)
			? finding.file.slice(workspaceRoot.length + 1)
			: finding.file,
	}));
	return {
		ok: result.ok,
		summary: result.ok
			? `Validation passed for ${book}${warningCount ? ` (${warningCount} warning(s))` : ""}.`
			: `Validation failed for ${book}: ${errorCount} error(s). Each finding names its file, field, and fix; check a corrected file with bookkit.check_content before writing it.`,
		payload: { book, findings },
		error: result.ok
			? undefined
			: {
					...validateBookFailedError(book, errorCount),
					cause: `${errorCount} validation error(s) in ${book}.`,
				},
	};
};
