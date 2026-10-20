import type { NormalizedErrorPayload } from "./normalized-error";

export const missingBookSlugError = (): NormalizedErrorPayload => ({
	machineCode: "VALIDATE_BOOK_MISSING_SLUG",
	humanSummary: "Book validation requires a slug.",
	location: { module: "mcp/tool-handlers/validate_book" },
	failingRule:
		"arguments.book must be provided when no endpoint default book slug is configured",
	nextAction:
		"Provide a book slug in arguments.book and rerun bookkit.validate_book.",
	severity: "error",
	gateLevel: "blocking",
});

/**
 * `bookkit.validate_book` found errors. It validates in process, with the
 * checker `bun run validate` uses; the machine code is kept from when it ran
 * `validate:book`, so clients matching on it still do.
 */
export const validateBookFailedError = (
	book: string,
	errorCount: number,
): NormalizedErrorPayload => ({
	machineCode: "VALIDATE_BOOK_COMMAND_FAILED",
	humanSummary: `Validation failed for ${book}: ${errorCount} error(s).`,
	location: { module: "validators/book-validator.ts" },
	failingRule: "a book must validate with zero errors",
	nextAction:
		"Fix each error in payload.findings (each names its file, field, and fix), check a corrected file with bookkit.check_content, then rerun bookkit.validate_book.",
	severity: "error",
	gateLevel: "blocking",
});

export const separationCommandFailedError = (
	exitCode: number,
): NormalizedErrorPayload => ({
	machineCode: "CHECK_SEPARATION_COMMAND_FAILED",
	humanSummary: `Separation checks failed: check:separation exited with code ${exitCode}.`,
	location: { module: "scripts/check-separation.ts" },
	failingRule:
		"content bindings must remain data-only and pass separation checks",
	nextAction:
		"Resolve the reported SEPARATION VIOLATIONS, then re-run bun run check:separation.",
	severity: "error",
	gateLevel: "blocking",
});
