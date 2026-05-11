import { runWorkspaceCommand } from "../command-runner";
import type { ToolHandler } from "./types";

export const handleExportBook: ToolHandler = ({ options, args }) => {
  const rawBook = args?.book;
  const book = typeof rawBook === "string" && rawBook.trim().length ? rawBook.trim() : options.bookSlug;
  if (!book) {
    return {
      ok: false,
      summary: "Book export requires a slug.",
      error: {
        cause: "Missing required arguments.book.",
        nextAction: "Call bookkit.list_books to see available slugs, then retry with bookkit.export_book({ book: '<slug>' }).",
      },
    };
  }

  const command = runWorkspaceCommand(options.workspaceRoot, [
    "run", "export:gitbook", "--", "--book", book,
  ]);

  return {
    ok: command.ok,
    summary: command.ok ? `Export of '${book}' succeeded.` : `Export of '${book}' failed.`,
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
          cause: `export:gitbook returned exit code ${command.exitCode}.`,
          nextAction: `Fix the export errors reported for '${book}' (for example missing content or config), then re-run bookkit.export_book({ book: '${book}' }).`,
        },
  };
};