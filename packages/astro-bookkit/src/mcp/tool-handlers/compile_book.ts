import { runWorkspaceCommand } from "../command-runner";
import type { ToolHandler } from "./types";

export const handleCompileBook: ToolHandler = ({ options, args }) => {
  const rawBook = args?.book;
  const book = typeof rawBook === "string" && rawBook.trim().length ? rawBook.trim() : options.bookSlug;
  if (!book) {
    return {
      ok: false,
      summary: "Book compilation requires a slug.",
      error: {
        cause: "Missing required arguments.book.",
        nextAction: "Call bookkit.list_books to see available slugs, then retry with bookkit.compile_book({ book: '<slug>' }).",
      },
    };
  }

  const command = runWorkspaceCommand(options.workspaceRoot, [
    "run", "compile:book", "--", "--book", book, "--mode", "error", "--no-drafts",
  ]);

  return {
    ok: command.ok,
    summary: command.ok ? `Compilation of '${book}' succeeded.` : `Compilation of '${book}' failed.`,
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
          cause: `compile:book returned exit code ${command.exitCode}.`,
          nextAction: `Fix the compilation errors reported for '${book}', then re-run bookkit.compile_book({ book: '${book}' }).`,
        },
  };
};