import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { scratchWorkspaceRoot } from "../packages/astro-bookkit/src/utils/scratch-workspace";

/**
 * The Bookkit workspace these scripts act on: the nearest directory, from the
 * current one up, that is a workspace root (it keeps books in apps/, or has
 * the tsconfig.base.json every workspace starts with). `bun run` keeps the
 * caller's directory, so a check started from apps/<book>/, docs/, or
 * scripts/ still sees every book instead of none. Outside any workspace it is
 * the current directory, so a script never reaches into one it was not run in.
 *
 * It does not walk up from a folder that is gone: the walk would leave a
 * deleted scratch workspace for the repository around it. A process a test
 * started in a scratch workspace gets that workspace, or an error.
 */
export function repoRoot(): string {
	let cwd: string;
	try {
		cwd = process.cwd();
	} catch {
		// On macOS the call itself fails once its folder is gone, where
		// Linux returns the deleted path and existsSync reports it; PWD
		// names the folder the child was started in.
		throw new Error(
			`The current folder no longer exists: ${process.env.PWD ?? "(unknown)"}\nRun the command again from a folder that does.`,
		);
	}
	if (!existsSync(cwd)) {
		throw new Error(
			`The current folder no longer exists: ${cwd}\nRun the command again from a folder that does.`,
		);
	}
	const scratch = scratchWorkspaceRoot(cwd);
	if (scratch) return scratch;
	for (let dir = cwd; ; dir = dirname(dir)) {
		if (
			existsSync(join(dir, "apps")) ||
			existsSync(join(dir, "tsconfig.base.json"))
		) {
			return dir;
		}
		if (dirname(dir) === dir) return cwd;
	}
}

export function listBookDirs(): string[] {
	const appsDir = join(repoRoot(), "apps");
	if (!existsSync(appsDir)) return [];
	return readdirSync(appsDir, { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => d.name)
		.sort();
}

/** Every file under `dir`, as sorted `/`-separated paths relative to it. */
export function listFilesRecursive(dir: string): string[] {
	return readdirSync(dir, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) =>
			relative(dir, join(entry.parentPath, entry.name)).split(sep).join("/"),
		)
		.sort();
}

export function listPackageDirs(): string[] {
	const packagesDir = join(repoRoot(), "packages");
	if (!existsSync(packagesDir)) return [];
	return readdirSync(packagesDir, { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => d.name);
}

export function optionalArg(flag: string): string | null {
	const idx = process.argv.indexOf(flag);
	if (idx === -1) return null;
	return process.argv[idx + 1] ?? null;
}

export function ensureDir(path: string) {
	if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

export function writeFileSafe(path: string, content: string) {
	if (existsSync(path)) {
		console.error(`Refusing to overwrite existing file: ${path}`);
		process.exit(1);
	}
	writeFileSync(path, content, "utf8");
}

export function slugify(raw: string): string {
	return raw
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "");
}

export function readText(path: string): string {
	return readFileSync(path, "utf8");
}
