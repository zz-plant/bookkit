import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

/**
 * The repo scripts a standalone project runs, relative to `scripts/`: the
 * `bookkit` CLI, the gates `verify` plans, and what the CLI and the MCP
 * tools spawn. The project gets these plus every script they import
 * (`vendoredScripts`), so a script that grows a new local import is copied
 * with it instead of failing in someone's new project.
 */
export const ENTRY_SCRIPTS = [
	"bookkit.ts",
	"verify.ts",
	"check-build.ts",
	"mcp-server.ts",
	"typecheck.ts",
	"validate-all.ts",
	"validate-book.ts",
	"check-separation.ts",
	"check-shims.ts",
	"check-todos.ts",
	"check-corpus.ts",
	"check-floating-concepts.ts",
	"check-suggestions.ts",
	"check-runbooks.ts",
	"import-book-from-markdown.ts",
	"propose-book.ts",
	"scaffold-book.ts",
	"scaffold-mechanism.ts",
	"scaffold-tool.ts",
	"scaffold-example.ts",
	"remove-book.ts",
	"compile-book.ts",
	"export-gitbook.ts",
	"list-books.ts",
] as const;

/** Copied as well, though no script imports it: `check:types` reads it. */
export const EXTRA_SCRIPT_FILES = ["tsconfig.json"] as const;

const ENGINE_PREFIX = `packages${sep}astro-bookkit${sep}`;

/** Module specifiers a source imports: static (type-only too), side-effect, dynamic, and require. */
export const importSpecifiers = (source: string): string[] =>
	[
		...source.matchAll(
			/^\s*(?:import|export)\b[^;]*?\bfrom\s*["']([^"'\n]+)["']|^\s*import\s*["']([^"'\n]+)["']|\b(?:import|require)\(\s*["']([^"'\n]+)["']\s*\)/gm,
		),
	].map((match) => match[1] ?? match[2] ?? match[3]);

const resolveModule = (from: string, specifier: string): string | undefined => {
	const base = join(dirname(from), specifier);
	return [base, `${base}.ts`, join(base, "index.ts")].find(
		(path) => existsSync(path) && statSync(path).isFile(),
	);
};

/** The package a bare specifier names: `@scope/name` or `name`. */
export const packageName = (specifier: string): string =>
	specifier.startsWith("@")
		? specifier.split("/").slice(0, 2).join("/")
		: specifier.split("/")[0];

export type VendoredScripts = {
	/** Paths relative to `scripts/`, sorted. */
	files: string[];
	/** Packages the scripts import by name; the project's root must install them. */
	packages: string[];
	/** Imports that resolve neither to a script nor to the engine. */
	unresolved: string[];
};

/**
 * Script files a source names in a string rather than importing, as
 * `runScript("validate-book.ts")` and `join("scripts", "lib", "x.mjs")` do.
 */
const namedScripts = (source: string, from: string, scriptsDir: string) =>
	[...source.matchAll(/["']([\w.-]+(?:\/[\w.-]+)*\.(?:ts|mjs))["']/g)]
		.flatMap((match) => [
			join(dirname(from), match[1]),
			join(scriptsDir, match[1]),
			join(scriptsDir, "lib", match[1]),
		])
		.filter(
			(path) =>
				existsSync(path) &&
				statSync(path).isFile() &&
				!path.endsWith(".test.ts") &&
				relative(scriptsDir, path).split(sep)[0] !== "..",
		);

/**
 * Every script reachable from `ENTRY_SCRIPTS` through relative imports, or
 * named in a string (a script run as a child process). Imports of the engine
 * are left out: the project vendors it whole.
 */
export const vendoredScripts = (
	repoRoot: string,
	entries: readonly string[] = ENTRY_SCRIPTS,
): VendoredScripts => {
	const scriptsDir = join(repoRoot, "scripts");
	const seen = new Set<string>();
	const packages = new Set<string>();
	const unresolved: string[] = [];
	const queue = entries.map((rel) => join(scriptsDir, rel));
	while (queue.length > 0) {
		const file = queue.shift() as string;
		if (seen.has(file)) continue;
		seen.add(file);
		const source = readFileSync(file, "utf8");
		queue.push(...namedScripts(source, file, scriptsDir));
		for (const specifier of importSpecifiers(source)) {
			if (specifier.startsWith("node:") || specifier.startsWith("bun:")) {
				continue;
			}
			if (!specifier.startsWith(".")) {
				packages.add(packageName(specifier));
				continue;
			}
			const target = resolveModule(file, specifier);
			const fromRoot = target ? relative(repoRoot, target) : "";
			if (target && fromRoot.startsWith(`scripts${sep}`)) {
				queue.push(target);
			} else if (!target || !fromRoot.startsWith(ENGINE_PREFIX)) {
				unresolved.push(`${relative(repoRoot, file)} imports ${specifier}`);
			}
		}
	}
	return {
		files: [...seen]
			.map((file) => relative(scriptsDir, file).split(sep).join("/"))
			.sort(),
		packages: [...packages].sort(),
		unresolved,
	};
};
