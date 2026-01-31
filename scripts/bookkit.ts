import { spawnSync } from "node:child_process";
import { join } from "node:path";

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === "--help" || command === "-h") {
  printHelp();
  process.exit(command ? 0 : 1);
}

switch (command) {
  case "new-book":
  case "book:new":
  case "book:add":
  case "add-book": {
    const passthrough = args.slice(1);
    const scriptPath = join(process.cwd(), "scripts", "scaffold-book.ts");
    const result = spawnSync(process.execPath, ["run", scriptPath, ...passthrough], {
      stdio: "inherit",
    });
    process.exit(result.status ?? 1);
  }
  default:
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
}

function printHelp() {
  console.log(`Bookkit CLI\n\nUsage:\n  bun run bookkit new-book -- --book <slug> [options]\n\nOptions (passed through to scaffold-book):\n  --title "Title"\n  --template <existing-book>\n  --skip-root-scripts\n  --skip-starter-content\n\nAliases:\n  add-book\n  book:add\n  book:new\n`);
}
