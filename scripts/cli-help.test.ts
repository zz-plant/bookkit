import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	cpSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { join, relative } from "node:path";
import { BOOKKIT_COMMANDS } from "./lib/bookkit-commands";
import { runChildAsync } from "./lib/child-process.fixture";

/**
 * `-h` and `--help` for every package script (the workspace's, and a book
 * app's) and every bookkit command, found in package.json and the command
 * table rather than listed here. Each must print its usage and exit 0
 * without doing what it documents: no file written or changed, and no
 * server left running (a command that has not exited by the deadline is
 * killed and fails). They run in scratch workspaces, so a command that does
 * act changes nothing here.
 */

const REPO = join(import.meta.dir, "..");
const BOOK = "on-call";
/** Long enough for bun to start under a loaded test run; a server never exits. */
const DEADLINE_MS = 30_000;

const readScripts = (file: string): Record<string, string> =>
	JSON.parse(readFileSync(file, "utf8")).scripts ?? {};

/**
 * Whether a script runs Bookkit's own code, whose help has a usage and
 * examples; the others (biome, bun test, astro) print their tools' help.
 */
const ownScript = (command: string) =>
	command.includes("scripts/") || /^bun run (?!--)/.test(command);

type Run = { label: string; argv: string[]; cwd: string; own: boolean };

const runs = (workspace: string): Run[] => {
	const appDir = join(workspace, "apps", BOOK);
	const scripts = [
		...Object.entries(readScripts(join(workspace, "package.json"))).map(
			([name, command]) => ({ name, command, cwd: workspace, where: "" }),
		),
		...Object.entries(readScripts(join(appDir, "package.json"))).map(
			([name, command]) => ({
				name,
				command,
				cwd: appDir,
				where: ` (${BOOK})`,
			}),
		),
	];
	const commands = BOOKKIT_COMMANDS.flatMap((command) => [
		...[command.name, ...(command.aliases ?? [])].map((name) => [name]),
		...(command.subcommands ?? []).map((kind) => [command.name, kind.name]),
	]);
	return ["--help", "-h"].flatMap((flag) => [
		...scripts.map(({ name, command, cwd, where }) => ({
			label: `bun run ${name} ${flag}${where}`,
			argv: [process.execPath, "run", name, flag],
			cwd,
			own: ownScript(command),
		})),
		...commands.map((words) => ({
			label: `bookkit ${words.join(" ")} ${flag}`,
			argv: [process.execPath, "run", "bookkit", ...words, flag],
			cwd: workspace,
			own: true,
		})),
	]);
};

/** A scratch workspace: this repo's engine and dependencies, a copy of its scripts and one book. */
const makeWorkspace = (): string => {
	const workspace = mkdtempSync(join(tmpdir(), "bookkit-cli-help-"));
	for (const entry of [
		"packages",
		"node_modules",
		"tsconfig.base.json",
		"biome.json",
	]) {
		symlinkSync(join(REPO, entry), join(workspace, entry));
	}
	for (const entry of ["package.json", ".gitignore", "corpus.json"]) {
		cpSync(join(REPO, entry), join(workspace, entry));
	}
	cpSync(join(REPO, "scripts"), join(workspace, "scripts"), {
		recursive: true,
		filter: (source) => !/\.(test|browser)\.ts$/.test(source),
	});
	const from = join(REPO, "apps", BOOK);
	cpSync(from, join(workspace, "apps", BOOK), {
		recursive: true,
		filter: (source) =>
			!/^(node_modules|dist|\.astro|\.bookkit)$/.test(relative(from, source)),
	});
	writeFileSync(join(workspace, "README.md"), "A scratch workspace.\n");
	return workspace;
};

/** Every file and folder in `dir` (links not followed), with its size and time. */
const snapshot = (dir: string): Map<string, string> => {
	const seen = new Map<string, string>();
	const walk = (folder: string) => {
		for (const entry of readdirSync(folder, { withFileTypes: true })) {
			const path = join(folder, entry.name);
			if (entry.isSymbolicLink()) continue;
			const stat = statSync(path);
			seen.set(relative(dir, path), `${stat.size}:${stat.mtimeMs}`);
			if (entry.isDirectory()) walk(path);
		}
	};
	walk(dir);
	return seen;
};

const changed = (before: Map<string, string>, after: Map<string, string>) =>
	[...new Set([...before.keys(), ...after.keys()])]
		.filter((path) => before.get(path) !== after.get(path))
		.sort();

type Result = { label: string; problems: string[] };

/** Runs `queue` one at a time in `workspace`, checking it before and after each. */
const runAll = async (workspace: string, queue: Run[]): Promise<Result[]> => {
	const results: Result[] = [];
	for (const run of queue) {
		const before = snapshot(workspace);
		const problems: string[] = [];
		try {
			const child = await runChildAsync(run.argv, {
				cwd: run.cwd,
				env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
				deadlineMs: DEADLINE_MS,
			});
			if (child.status !== 0) {
				problems.push(`exited ${child.status}: ${child.output.slice(0, 400)}`);
			}
			if (run.own && !/^Usage:/m.test(child.stdout)) {
				problems.push(`printed no "Usage:": ${child.output.slice(0, 400)}`);
			}
			if (run.own && !/^Examples:?$/m.test(child.stdout)) {
				problems.push("printed no examples");
			}
			if (!run.own && !child.output.trim()) problems.push("printed nothing");
		} catch (error) {
			problems.push(error instanceof Error ? error.message : String(error));
		}
		const writes = changed(before, snapshot(workspace));
		if (writes.length > 0) problems.push(`changed ${writes.join(", ")}`);
		results.push({ label: run.label, problems });
	}
	return results;
};

const workspaces: string[] = [];
let results: Result[] = [];

beforeAll(async () => {
	const count = Math.max(1, Math.min(4, availableParallelism() - 1));
	for (let index = 0; index < count; index += 1) {
		workspaces.push(makeWorkspace());
	}
	const all = runs(workspaces[0]);
	// The same commands, spread over the workspaces, each with its own copy.
	const shares = workspaces.map((workspace, index) =>
		all
			.filter((_, position) => position % workspaces.length === index)
			.map((run) => ({
				...run,
				cwd: join(workspace, relative(workspaces[0], run.cwd)),
			})),
	);
	results = (
		await Promise.all(
			shares.map((share, index) => runAll(workspaces[index], share)),
		)
	).flat();
}, 15 * 60_000);

afterAll(() => {
	for (const workspace of workspaces) {
		// A server a command started outlives the killed command; stop it too.
		Bun.spawnSync(["pkill", "-f", workspace]);
		rmSync(workspace, { recursive: true, force: true });
	}
});

describe("--help", () => {
	it("is answered by every package script and bookkit command, with usage and examples, changing nothing", () => {
		expect(results.length).toBeGreaterThan(100);
		expect(results.filter((result) => result.problems.length > 0)).toEqual([]);
	});

	it("covers every command bookkit dispatches", () => {
		const source = readFileSync(join(REPO, "scripts", "bookkit.ts"), "utf8");
		const top = source.slice(
			source.indexOf("switch (findCommand(command)?.name ?? command) {"),
		);
		const dispatched = [
			...top.slice(0, top.indexOf("\n}\n")).matchAll(/^\tcase "([^"]+)":/gm),
		].map((match) => match[1]);
		expect(dispatched.sort()).toEqual(
			BOOKKIT_COMMANDS.map((command) => command.name)
				.filter((name) => name !== "help")
				.sort(),
		);
		const createNew = source.slice(source.indexOf("function createNew("));
		const kinds = [
			...createNew
				.slice(0, createNew.indexOf("\n}\n"))
				.matchAll(/^\t\tcase "([^"]+)":/gm),
		].map((match) => match[1]);
		expect(kinds.sort()).toEqual(
			(
				BOOKKIT_COMMANDS.find((command) => command.name === "new")
					?.subcommands ?? []
			)
				.map((kind) => kind.name)
				.sort(),
		);
	});
});
