import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { listBookDirs, optionalArg, repoRoot } from "./_lib";
import { type Finding, groupFindingsByFile } from "./lib/authoring";
import { type Gate, planGates } from "./lib/verify-plan";

/**
 * verify — runs the checks a change needs, judged by which files it touches.
 *
 *   bun run verify                    # changes since origin/main, committed or not
 *   bun run verify -- --base <ref>    # compare against another ref
 *   bun run verify -- --all           # every gate CI runs
 *   bun run verify -- --list          # show the plan, run nothing
 *   bun run verify -- --json          # one JSON summary on stdout
 *
 * Content checks report only findings in the files you changed, so an
 * existing warning elsewhere in a book does not hide a new one. Exits 1 if
 * any check fails.
 */

const root = repoRoot();
if (!existsSync(join(root, "node_modules"))) {
	console.error("node_modules is missing. Run bun install first.");
	process.exit(1);
}
const all = process.argv.includes("--all");
const listOnly = process.argv.includes("--list");
const asJson = process.argv.includes("--json");

const git = (args: string[]): string[] => {
	const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
	return result.status === 0
		? result.stdout
				.split("\n")
				.map((line) => line.trim())
				.filter(Boolean)
		: [];
};

const resolveBase = (): string | null => {
	const requested = optionalArg("--base");
	const candidates = requested ? [requested] : ["origin/main", "main"];
	for (const ref of candidates) {
		if (git(["rev-parse", "--verify", "--quiet", ref]).length > 0) return ref;
	}
	return null;
};

const base = resolveBase();
const mergeBase = base ? git(["merge-base", "HEAD", base])[0] : undefined;
const changed = [
	...new Set([
		...(mergeBase ? git(["diff", "--name-only", mergeBase, "HEAD"]) : []),
		...git(["diff", "--name-only", "--cached"]),
		...git(["diff", "--name-only"]),
		...git(["ls-files", "--others", "--exclude-standard"]),
	]),
].sort();

if (!all && !base) {
	console.error(
		"No base to compare against (tried origin/main and main). Pass --base <ref>, or --all.",
	);
	process.exit(1);
}

const gates = planGates(all ? null : changed, listBookDirs(), (file) =>
	existsSync(join(root, file)),
);

const describeScope = () =>
	all
		? "every gate"
		: `${changed.length} changed file${changed.length === 1 ? "" : "s"} since ${base}`;

if (listOnly || gates.length === 0) {
	if (asJson) {
		console.log(JSON.stringify({ base, changed, gates }, null, 2));
	} else {
		console.log(`VERIFY  ${describeScope()}`);
		if (gates.length === 0) console.log("  Nothing to check.");
		for (const gate of gates) {
			console.log(`  ${gate.label.padEnd(24)} ${gate.why}`);
		}
	}
	process.exit(0);
}

type GateResult = Gate & {
	ok: boolean;
	seconds: number;
	output: string;
	findings?: Finding[];
};

/** Findings a content gate reports, narrowed to the files this change touched. */
const relevantFindings = (findings: Finding[]): Finding[] => {
	if (all) return findings;
	const touched = new Set(changed);
	const names = changed.map((file) => basename(file));
	return findings.filter((finding) =>
		finding.file
			? touched.has(finding.file)
			: names.some((name) => finding.message.includes(name)),
	);
};

const run = (command: string[]) => {
	// Run bun as this process does, so it needs no `bun` on PATH.
	const [program, ...args] = command;
	return spawnSync(program === "bun" ? process.execPath : program, args, {
		cwd: root,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
		env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
	});
};

const runGate = (gate: Gate): GateResult => {
	const started = performance.now();
	let output = "";
	let result: ReturnType<typeof run> | undefined;
	for (const command of gate.commands) {
		result = run(command);
		output += `${result.stdout ?? ""}${result.stderr ?? ""}`;
		if (result.status !== 0) break;
	}
	const seconds = (performance.now() - started) / 1000;
	if (!result) return { ...gate, ok: true, seconds, output };
	if (gate.parse === "validate-json") {
		try {
			const parsed = JSON.parse(result.stdout) as {
				ok: boolean;
				findings: Finding[];
			};
			const findings = relevantFindings(parsed.findings);
			return {
				...gate,
				ok: !findings.some((finding) => finding.level === "error"),
				seconds,
				output: "",
				findings,
			};
		} catch {
			// Fall through: report the raw output.
		}
	}
	return { ...gate, ok: result.status === 0, seconds, output };
};

if (!asJson) {
	console.log(`VERIFY  ${describeScope()}\n`);
}

const results: GateResult[] = [];
for (const gate of gates) {
	// The progress marker is overwritten in place, which only works on a terminal.
	if (!asJson && process.stdout.isTTY)
		process.stdout.write(`  … ${gate.label}`);
	const result = runGate(gate);
	results.push(result);
	if (asJson) continue;
	process.stdout.write(
		`${process.stdout.isTTY ? "\r" : ""}  ${result.ok ? "✓" : "✗"} ${gate.label.padEnd(24)} ${result.seconds.toFixed(1)}s\n`,
	);
	for (const level of ["error", "warning"] as const) {
		const messages = (result.findings ?? [])
			.filter((finding) => finding.level === level)
			.map((finding) =>
				finding.file
					? `${finding.message}: ${join(root, finding.file)}`
					: finding.message,
			);
		for (const line of groupFindingsByFile(messages)) {
			console.log(`      ${level}: ${line}`);
		}
	}
	if (!result.ok && result.output) {
		const tail = result.output.trimEnd().split("\n").slice(-40);
		for (const line of tail) console.log(`      ${line}`);
	}
}

const failed = results.filter((result) => !result.ok);
if (asJson) {
	console.log(
		JSON.stringify(
			{
				base,
				changed,
				ok: failed.length === 0,
				gates: results.map(({ id, label, ok, seconds, findings, output }) => ({
					id,
					label,
					ok,
					seconds: Math.round(seconds * 10) / 10,
					findings,
					output: ok ? undefined : output.trimEnd().split("\n").slice(-40),
				})),
			},
			null,
			2,
		),
	);
} else {
	console.log(
		failed.length === 0
			? `\nAll ${results.length} checks passed.`
			: `\n${failed.length} of ${results.length} checks failed: ${failed.map((result) => result.label).join(", ")}.`,
	);
}

process.exit(failed.length === 0 ? 0 : 1);
