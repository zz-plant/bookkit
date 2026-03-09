import { runWorkspaceCommand } from "../command-runner";
import type { ToolHandler } from "./types";
import {
  missingBookSlugError,
  validateBookCommandFailedError,
} from "../../validators/governance-errors";

export const toValidateBookFailure = (exitCode: number) => {
  const normalized = validateBookCommandFailedError(exitCode);
  return {
    cause: normalized.humanSummary,
    nextAction: normalized.nextAction,
    ...normalized,
  };
};

export const handleValidateBook: ToolHandler = ({ options, args }) => {
  const rawBook = args?.book;
  const book = typeof rawBook === "string" && rawBook.trim().length ? rawBook.trim() : options.bookSlug;
  if (!book) {
    const normalized = missingBookSlugError();
    return {
      ok: false,
      summary: normalized.humanSummary,
      error: {
        cause: normalized.humanSummary,
        nextAction: normalized.nextAction,
        ...normalized,
      },
    };
  }

  const command = runWorkspaceCommand(options.workspaceRoot, ["run", "validate:book", "--", "--book", book]);
  return {
    ok: command.ok,
    summary: command.ok ? `Validation passed for ${book}.` : `Validation failed for ${book}.`,
    payload: {
      book,
      command: command.command,
      exitCode: command.exitCode,
      stdout: command.stdout.trim(),
      stderr: command.stderr.trim(),
    },
    error: command.ok
      ? undefined
      : toValidateBookFailure(command.exitCode),
  };
};
