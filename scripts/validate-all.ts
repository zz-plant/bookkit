import { optionalArg, listBookDirs } from "./_lib";
import { spawnSync } from "node:child_process";

const mode = optionalArg("--mode") ?? "warn";
const noDrafts = process.argv.includes("--no-drafts");

const books = listBookDirs();
if (books.length === 0) {
  console.error("No books found under apps/*");
  process.exit(1);
}

let failed = 0;

for (const book of books) {
  const args = [
    "run",
    "--filter",
    `@books/${book}`,
    "validate",
    "--",
    "--mode",
    mode,
    ...(noDrafts ? ["--no-drafts"] : []),
  ];

  const res = spawnSync("bun", args, { stdio: "inherit" });
  if (res.status !== 0) failed++;
}

process.exit(failed === 0 ? 0 : 1);
