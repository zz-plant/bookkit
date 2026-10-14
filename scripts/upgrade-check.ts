import { spawnSync } from "node:child_process";

// `--release` is accepted for older callers: each book's status already
// decides whether release rules apply.
const steps = [
	{
		label: "Lint (Biome)",
		command: ["bun", "run", "lint"],
	},
	{
		label: "Typecheck (.ts and .astro across apps/* and packages/*)",
		command: ["bun", "run", "check:types"],
	},
	{
		label: "Validation (release rules for published and stable books)",
		command: ["bun", "run", "validate"],
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
