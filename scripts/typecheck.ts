import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { listBookDirs, listPackageDirs, repoRoot } from "./_lib";
import { exitOnHelp } from "./lib/cli";
import { hashInputs } from "./lib/input-hash";

/**
 * check:types — typechecks every app and package, `.ts` and `.astro` alike,
 * plus `scripts/`.
 *
 * TypeScript 7 is installed under the alias `typescript-native` because the
 * `typescript` package stays on 5.x: scripts/lib/site-config.ts parses
 * book.config.ts with the 5.x compiler API, which 7.x replaced.
 *
 * Neither compiler reads `.astro` files, so `astro check` covers them: every
 * book app, plus each package that ships `.astro` components, the engine's
 * routes among them.
 *
 * A project that passed is not checked again while nothing it reads has
 * changed: its folder, the folders it imports from, the lockfile, and the
 * shared tsconfig (see inputsOf). Passes are recorded in
 * node_modules/.cache/bookkit-typecheck. CI checks everything every time.
 */

exitOnHelp({
	summary:
		"Typechecks every book app and package, .ts and .astro alike, plus\nscripts/. A project that passed is not checked again while nothing it\nreads has changed (never in CI).",
	usage: ["bun run check:types [--tsc] [--no-astro] [--no-cache]"],
	options: [
		["--tsc", "Use TypeScript 5 for the .ts pass (the fallback)"],
		["--no-astro", "The .ts pass only, for a quick loop"],
		["--no-cache", "Check every project, even unchanged ones"],
	],
	examples: ["bun run check:types", "bun run check:types -- --no-astro"],
});

const root = repoRoot();
const useTsc5 = process.argv.includes("--tsc");
const skipAstro = process.argv.includes("--no-astro");
const useRecord = !process.argv.includes("--no-cache") && !process.env.CI;
const recordDir = join(root, "node_modules", ".cache", "bookkit-typecheck");
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
type JobResult = Job & { status: number; output: string; reused?: boolean };

const ROOT_FILES = ["package.json", "bun.lock", "tsconfig.base.json"];

/**
 * What a project's check reads. A book app imports only itself and the
 * engine; the engine imports only itself; scripts/ imports the packages, and
 * create-bookkit imports scripts/. Astro's generated types are gitignored but
 * read, so an app's .astro/ counts too.
 */
const inputsOf = (job: Job): { inputs: string[]; extra: string[] } => {
	if (job.label.startsWith("apps/")) {
		return {
			inputs: [job.label, "packages/astro-bookkit", ...ROOT_FILES],
			extra: [`${job.label}/.astro`],
		};
	}
	if (job.label === "packages/astro-bookkit") {
		return { inputs: [job.label, ...ROOT_FILES], extra: [] };
	}
	return { inputs: ["packages", "scripts", ...ROOT_FILES], extra: [] };
};

const recordPath = (job: Job): string => {
	const { inputs, extra } = inputsOf(job);
	const key = createHash("sha256")
		.update(
			JSON.stringify([
				job.kind,
				job.label,
				job.kind === "ts" ? compiler.label : "astro check",
				hashInputs(root, inputs, extra),
			]),
		)
		.digest("hex");
	return join(recordDir, key);
};

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
const records = new Map<Job, string>();
if (useRecord) {
	for (const job of jobs) {
		const record = recordPath(job);
		records.set(job, record);
		if (existsSync(record)) {
			results.set(job, { ...job, status: 0, output: "", reused: true });
			queue.splice(queue.indexOf(job), 1);
		}
	}
}
await Promise.all(
	Array.from(
		{ length: Math.min(queue.length, availableParallelism()) },
		async () => {
			for (let job = queue.shift(); job; job = queue.shift()) {
				const result = await runJob(job);
				results.set(job, result);
				const record = records.get(job);
				if (record && result.status === 0) {
					mkdirSync(recordDir, { recursive: true });
					writeFileSync(record, "");
				}
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
			console.log(
				`  ✓ ${result.label}${result.reused ? " (unchanged since it passed)" : ""}`,
			);
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
const reused = [...results.values()].filter((result) => result.reused).length;
if (reused > 0) {
	console.log(
		`\n${reused} of ${jobs.length} checks skipped: nothing they read changed since they passed. --no-cache runs them all.`,
	);
}

process.exit(failed === 0 ? 0 : 1);
