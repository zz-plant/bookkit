import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { listBookDirs, listPackageDirs, repoRoot } from "./_lib";

/**
 * check:types — typechecks every app and package, `.ts` and `.astro` alike,
 * plus `scripts/`.
 *
 *   bun run check:types                 # TypeScript 7 and astro check
 *   bun run check:types -- --tsc        # TypeScript 5 for the .ts pass (fallback)
 *   bun run check:types -- --no-astro   # .ts only, for a quick local loop
 *
 * TypeScript 7 is installed under the alias `typescript-native` because the
 * `typescript` package stays on 5.x: scripts/lib/site-config.ts parses
 * book.config.ts with the 5.x compiler API, which 7.x replaced.
 *
 * Neither compiler reads `.astro` files, so `astro check` covers them: every
 * book app, plus each package that ships `.astro` components. Template pages
 * are checked through their copies in each book (check:shims keeps them
 * identical).
 */

const root = repoRoot();
const useTsc5 = process.argv.includes("--tsc");
const skipAstro = process.argv.includes("--no-astro");
const nativeTsc = join(root, "node_modules", "typescript-native", "bin", "tsc");

if (!useTsc5 && !existsSync(nativeTsc)) {
	console.error(
		"TypeScript 7 is not installed (devDependency typescript-native). Run bun install, or pass --tsc to typecheck with TypeScript 5.",
	);
	process.exit(1);
}

// The TypeScript 7 launcher is a JS shim; run it with the current runtime so
// it needs neither a `node` on PATH nor a linked bin.
const compiler = useTsc5
	? { label: "TypeScript 5", command: "bunx", args: ["tsc"] }
	: { label: "TypeScript 7", command: process.execPath, args: [nativeTsc] };

const hasAstroFiles = (dir: string) =>
	existsSync(dir) &&
	readdirSync(dir, { recursive: true }).some((entry) =>
		String(entry).endsWith(".astro"),
	);

const targets = [
	...listBookDirs().map((book) => ({
		label: `apps/${book}`,
		dir: join(root, "apps", book),
	})),
	...listPackageDirs().map((pkg) => ({
		label: `packages/${pkg}`,
		dir: join(root, "packages", pkg),
	})),
	// The CLI and governance gates, with their tests (Bun types).
	{ label: "scripts", dir: join(root, "scripts") },
].filter((target) => existsSync(join(target.dir, "tsconfig.json")));

if (targets.length === 0) {
	console.error("No tsconfig.json files found under apps/* or packages/*.");
	process.exit(1);
}

type Job = { label: string; kind: "ts" | "astro"; dir: string };
type JobResult = Job & { status: number; output: string };

const run = (job: Job, command: string, args: string[], cwd?: string) =>
	new Promise<JobResult>((resolve) => {
		let output = "";
		const child = spawn(command, args, { cwd });
		child.stdout.on("data", (chunk) => {
			output += chunk;
		});
		child.stderr.on("data", (chunk) => {
			output += chunk;
		});
		child.on("error", (error) =>
			resolve({
				...job,
				status: 1,
				output: `${output}\nCould not run ${job.kind === "ts" ? compiler.label : "astro check"}: ${error.message}`,
			}),
		);
		child.on("close", (status) =>
			resolve({ ...job, status: status ?? 1, output }),
		);
	});

const runJob = (job: Job) =>
	job.kind === "ts"
		? run(job, compiler.command, [
				...compiler.args,
				"--noEmit",
				"-p",
				join(job.dir, "tsconfig.json"),
			])
		: run(job, "bunx", ["astro", "check"], job.dir);

const astroTargets = skipAstro
	? []
	: targets.filter(
			(target) =>
				existsSync(join(target.dir, "astro.config.mjs")) ||
				hasAstroFiles(join(target.dir, "src")),
		);

// One queue, as many processes as cores. astro check takes several times as
// long as the TypeScript pass, so it starts first and the TypeScript jobs fill
// the cores it leaves idle. On four cores: 27s, against 32-36s for the TypeScript
// pass followed by astro check.
const queue: Job[] = [
	// Packages first: the engine's own check is the longest single job.
	...[...astroTargets]
		.sort(
			(a, b) =>
				Number(b.label.startsWith("packages/")) -
				Number(a.label.startsWith("packages/")),
		)
		.map((target) => ({ ...target, kind: "astro" as const })),
	...targets.map((target) => ({ ...target, kind: "ts" as const })),
];
const jobs = [...queue];
const results = new Map<Job, JobResult>();
await Promise.all(
	Array.from(
		{ length: Math.min(queue.length, availableParallelism()) },
		async () => {
			for (let job = queue.shift(); job; job = queue.shift()) {
				results.set(job, await runJob(job));
			}
		},
	),
);

let failed = 0;
const report = (kind: Job["kind"], header: string) => {
	const ofKind = jobs.filter((job) => job.kind === kind);
	if (ofKind.length === 0) return;
	console.log(`\n${header}`);
	for (const job of ofKind) {
		const result = results.get(job);
		if (!result) continue;
		if (result.status === 0) {
			console.log(`  ✓ ${result.label}`);
		} else {
			failed++;
			console.log(`  ✗ ${result.label}\n${result.output}`);
		}
	}
};
report("ts", `.ts files in ${targets.length} project(s) (${compiler.label})`);
report(
	"astro",
	`.astro files in ${astroTargets.length} project(s) (astro check)`,
);

process.exit(failed === 0 ? 0 : 1);
