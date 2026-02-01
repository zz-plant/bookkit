import { spawnSync } from "node:child_process";
import { listBookDirs, optionalArg, requireArg } from "./_lib";

const wantsHelp = process.argv.includes("--help") || process.argv.includes("-h");
if (wantsHelp) {
  printHelp();
  process.exit(0);
}

const book = requireArg("--book");
const mode = optionalArg("--mode") ?? "warn";
const noDrafts = process.argv.includes("--no-drafts");
const skipValidate = process.argv.includes("--skip-validate");
const exportTarget = optionalArg("--export");

const books = listBookDirs();
if (!books.includes(book)) {
  console.error(`Unknown book: ${book}`);
  console.error("Available books:");
  for (const entry of books) console.error(`- ${entry}`);
  process.exit(1);
}

if (!skipValidate) {
  runStep("validate", [
    "run",
    "--filter",
    `@books/${book}`,
    "validate",
    "--",
    "--mode",
    mode,
    ...(noDrafts ? ["--no-drafts"] : []),
  ]);
}

runStep("build", ["run", "--filter", `@books/${book}`, "build"]);

if (exportTarget) {
  if (exportTarget !== "gitbook") {
    console.error(`Unknown export target: ${exportTarget}`);
    console.error("Supported targets: gitbook");
    process.exit(1);
  }
  runStep("export", ["run", "export:gitbook", "--", "--book", book]);
}

function runStep(label: string, args: string[]) {
  console.log(`\n[bookkit] ${label}`);
  const res = spawnSync("bun", args, { stdio: "inherit" });
  if (res.status !== 0) {
    console.error(`\n[bookkit] ${label} failed`);
    process.exit(res.status ?? 1);
  }
}

function printHelp() {
  console.log(`Compile a book (validate + build + optional export).

Usage:
  bun run compile:book -- --book <slug> [options]

Options:
  --mode <warn|error>   Validation mode (default: warn)
  --no-drafts           Disallow draft examples in validation
  --skip-validate       Skip validation step
  --export <target>     Optional export target (gitbook)
  -h, --help            Show this help message
`);
}
