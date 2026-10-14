import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join, relative, sep } from "node:path";

export function repoRoot(): string {
	return process.cwd();
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

export function requireArg(flag: string): string {
	const idx = process.argv.indexOf(flag);
	if (idx === -1 || !process.argv[idx + 1]) {
		console.error(`Missing required arg: ${flag} <value>`);
		process.exit(1);
	}
	return process.argv[idx + 1];
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
