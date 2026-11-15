import { checkBookContent } from "../../validators/book-validator";
import {
	missingBookSlugError,
	validateBookFailedError,
} from "../../validators/governance-errors";
import { bookArg } from "./book-arg";
import type { ToolHandler } from "./types";

/**
 * Validates a book in-process with the same checker as `bun run validate`:
 * each finding has a code, the field, a fix, and its file.
 */
export const handleValidateBook: ToolHandler = async ({ options, args }) => {
	if (options.folderMode && !args?.book) {
		const result = await options.folderMode.validate({
			releaseMode: args?.releaseMode === true,
		});
		const errorCount = result.findings.filter(
			(finding) => finding.level === "error",
		).length;
		const warningCount = result.findings.length - errorCount;
		return {
			ok: result.ok,
			summary: result.ok
				? `Validation passed for folder ${options.folderMode.dir}${warningCount ? ` (${warningCount} warning(s))` : ""}.`
				: `Validation failed for folder ${options.folderMode.dir}: ${errorCount} error(s).`,
			payload: {
				folder: options.folderMode.dir,
				frame: result.frame,
				findings: result.findings,
			},
			error: result.ok
				? undefined
				: {
						...validateBookFailedError(options.folderMode.dir, errorCount),
						cause: `${errorCount} validation error(s) in ${options.folderMode.dir}.`,
					},
		};
	}

	const picked = bookArg(options, args);
	if (!picked.ok) return picked.response;
	const book = picked.book;
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
	// Then every MDX file through the compiler the build uses, as
	// `bun run validate` does; a file reported for an HTML comment fails for
	// that reason already.
	const { compileBookFindings } = await import("../../validators/mdx-compile");
	const compiled = await compileBookFindings(
		workspaceRoot,
		book,
		new Set(
			result.findings.flatMap((finding) =>
				finding.code === "MDX_HTML_COMMENT" && finding.file
					? [finding.file]
					: [],
			),
		),
	);
	const all = [...result.findings, ...compiled];
	const ok = !all.some((finding) => finding.level === "error");
	const errorCount = all.filter((finding) => finding.level === "error").length;
	const warningCount = all.length - errorCount;
	const findings = all.map((finding) => ({
		...finding,
		file: finding.file?.startsWith(`${workspaceRoot}/`)
			? finding.file.slice(workspaceRoot.length + 1)
			: finding.file,
	}));
	return {
		ok,
		summary: ok
			? `Validation passed for ${book}${warningCount ? ` (${warningCount} warning(s))` : ""}.`
			: `Validation failed for ${book}: ${errorCount} error(s). Each finding names its file, field, and fix; check a corrected file with bookkit.check_content before writing it.`,
		payload: { book, findings },
		error: ok
			? undefined
			: {
					...validateBookFailedError(book, errorCount),
					cause: `${errorCount} validation error(s) in ${book}.`,
				},
	};
};
