import type { NormalizedErrorPayload } from "./normalized-error";

export const missingBookSlugError = (): NormalizedErrorPayload => ({
  machineCode: "VALIDATE_BOOK_MISSING_SLUG",
  humanSummary: "Book validation requires a slug.",
  location: { module: "mcp/tool-handlers/validate_book" },
  failingRule: "arguments.book must be provided when no endpoint default book slug is configured",
  nextAction: "Provide a book slug in arguments.book and rerun bookkit.validate_book.",
  severity: "error",
  gateLevel: "blocking",
});

export const validateBookCommandFailedError = (exitCode: number): NormalizedErrorPayload => ({
  machineCode: "VALIDATE_BOOK_COMMAND_FAILED",
  humanSummary: `Validation failed: validate:book exited with code ${exitCode}.`,
  location: { module: "scripts/validate-book.ts" },
  failingRule: "validate:book must complete with zero errors",
  nextAction: "Fix the reported validation ERRORS, then re-run bun run validate:book -- --book <slug>.",
  severity: "error",
  gateLevel: "blocking",
});

export const separationCommandFailedError = (exitCode: number): NormalizedErrorPayload => ({
  machineCode: "CHECK_SEPARATION_COMMAND_FAILED",
  humanSummary: `Separation checks failed: check:separation exited with code ${exitCode}.`,
  location: { module: "scripts/check-separation.ts" },
  failingRule: "content bindings must remain data-only and pass separation checks",
  nextAction: "Resolve the reported SEPARATION VIOLATIONS, then re-run bun run check:separation.",
  severity: "error",
  gateLevel: "blocking",
});
