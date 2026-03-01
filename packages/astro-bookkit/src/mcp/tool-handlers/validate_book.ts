import { runWorkspaceCommand } from "../command-runner";
import type { ToolHandler } from "./types";

export const handleValidateBook: ToolHandler = ({ options, args }) => {
  const rawBook = args?.book;
  const book = typeof rawBook === "string" && rawBook.trim().length ? rawBook.trim() : options.bookSlug;
  if (!book) {
    return {
      ok: false,
      summary: "Book validation requires a slug.",
      error: {
        cause: "Missing required arguments.book and no default endpoint book slug is configured.",
        nextAction: "Provide a book slug in arguments.book and rerun bookkit.validate_book.",
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
      : {
          cause: `validate:book returned exit code ${command.exitCode}.`,
          nextAction: "Fix the reported validation errors, then re-run bun run validate:book -- --book <slug>.",
        },
  };
};
