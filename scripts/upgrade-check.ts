import { spawnSync } from "node:child_process";

const useReleaseMode = process.argv.includes("--release");

const steps = [
	{
		label: "Lint (Biome/Prettier via scripts/lint.ts)",
		command: ["bun", "run", "lint"],
	},
	{
		label: "Typecheck (.ts and .astro across apps/* and packages/*)",
		command: ["bun", "run", "check:types"],
	},
	{
		label: `Validation (${useReleaseMode ? "error" : "warn"} mode)`,
		command: ["bun", "run", useReleaseMode ? "validate:release" : "validate"],
	},
	{
		label: "Separation check (content vs engine)",
		command: ["bun", "run", "check:separation"],
	},
	{
		label: "Floating concept check",
		command: ["bun", "run", "check:concepts"],
	},
];

let failed = 0;

for (const step of steps) {
	console.log(`\n==> ${step.label}`);
	const res = spawnSync(step.command[0], step.command.slice(1), {
		stdio: "inherit",
	});
	if (res.status !== 0) failed++;
}

process.exit(failed === 0 ? 0 : 1);
