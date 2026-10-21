import husky from "husky";
import { exitOnHelp } from "./lib/cli";

exitOnHelp({
	summary:
		"Installs this repository's git hooks with husky: the pre-commit hook\nruns lint-staged on the staged files. bun install runs it.",
	usage: ["bun run prepare"],
	examples: ["bun run prepare"],
});

// What husky's own command prints: nothing, or why it installed nothing.
process.stdout.write(husky());
