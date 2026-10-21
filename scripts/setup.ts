import { spawnSync } from "node:child_process";
import { exitOnHelp } from "./lib/cli";

exitOnHelp({
	summary:
		"Sets up a clone with mise: trusts this repository's mise.toml, so mise\ninstalls the Bun version package.json pins, then runs bun install.",
	usage: ["bun run setup"],
	notes: "Without mise, install Bun 1.3.14 yourself and run bun install.",
	examples: ["bun run setup"],
});

for (const [command, ...args] of [
	["mise", "trust"],
	["bun", "install"],
]) {
	const result = spawnSync(command, args, { stdio: "inherit" });
	if (result.error) {
		console.error(`Could not run ${command}: ${result.error.message}`);
		process.exit(1);
	}
	if (result.status !== 0) process.exit(result.status ?? 1);
}
