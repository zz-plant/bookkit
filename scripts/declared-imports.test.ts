import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { join, relative } from "node:path";
import { repoRoot } from "./_lib";

/**
 * Every package an import names must be a dependency of the package the file
 * belongs to: scripts/ → the root package.json, packages/<name>/ → its own.
 * Otherwise the import resolves only because a book or another package
 * happened to install it (hoisting), and breaks where that is not so: a
 * workspace with no books, or a project create-bookkit copied the code into.
 */

type Manifest = {
	name?: string;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
};

const SOURCE = /\.(ts|tsx|mts|js|mjs|astro)$/;
const SKIPPED = new Set(["node_modules", "dist", ".astro", "templates"]);
const builtins = new Set(builtinModules);

const sourceFiles = (dir: string, out: string[] = []): string[] => {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (SKIPPED.has(entry.name)) continue;
		const path = join(dir, entry.name);
		if (entry.isDirectory()) sourceFiles(path, out);
		else if (SOURCE.test(entry.name)) out.push(path);
	}
	return out;
};

const transpilers = {
	ts: new Bun.Transpiler({ loader: "ts" }),
	tsx: new Bun.Transpiler({ loader: "tsx" }),
	js: new Bun.Transpiler({ loader: "js" }),
};
const transpilerFor = (file: string) =>
	file.endsWith(".tsx")
		? transpilers.tsx
		: /\.m?js$/.test(file)
			? transpilers.js
			: transpilers.ts;

/** Import and export-from statements at the start of a line, type-only included. */
const STATEMENTS = [
	/^\s*import\s+(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+(?:\s*,\s*\{[^}]*\})?)\s+from\s*["']([^"']+)["']/gm,
	/^\s*export\s+(?:type\s+)?(?:\{[^}]*\}|\*(?:\s+as\s+\w+)?)\s+from\s*["']([^"']+)["']/gm,
];

/**
 * Package names a file imports. Bun's scanner finds runtime imports (static,
 * dynamic, require) and skips text inside strings, but drops type-only
 * imports, which still need the package installed; STATEMENTS adds those.
 */
const importedPackages = (file: string, source: string): string[] => {
	// An .astro file's imports live in its frontmatter.
	const code = (
		file.endsWith(".astro")
			? (source.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "")
			: source
	).replace(/^#!.*/, "");
	const specifiers = [
		...transpilerFor(file)
			.scanImports(code)
			.map((entry) => entry.path),
		...STATEMENTS.flatMap((pattern) =>
			[...code.matchAll(pattern)].map((match) => match[1]),
		),
	];
	return specifiers
		.filter(
			(specifier) =>
				!/^(\.|\/|node:|bun:|astro:)/.test(specifier) &&
				specifier !== "bun" &&
				!builtins.has(specifier.split("/")[0]),
		)
		.map((specifier) =>
			specifier
				.split("/")
				.slice(0, specifier.startsWith("@") ? 2 : 1)
				.join("/"),
		);
};

const declared = (manifest: Manifest) =>
	new Set([
		...(manifest.name ? [manifest.name] : []),
		...Object.keys(manifest.dependencies ?? {}),
		...Object.keys(manifest.devDependencies ?? {}),
		...Object.keys(manifest.peerDependencies ?? {}),
		...Object.keys(manifest.optionalDependencies ?? {}),
	]);

const root = repoRoot();
const owners = [
	{ dir: "scripts", manifest: "package.json" },
	...readdirSync(join(root, "packages")).map((name) => ({
		dir: join("packages", name),
		manifest: join("packages", name, "package.json"),
	})),
];

describe("imports name declared dependencies", () => {
	for (const owner of owners) {
		it(`${owner.dir} imports only what ${owner.manifest} declares`, () => {
			const allowed = declared(
				JSON.parse(readFileSync(join(root, owner.manifest), "utf8")),
			);
			const undeclared: string[] = [];
			for (const file of sourceFiles(join(root, owner.dir))) {
				for (const name of importedPackages(file, readFileSync(file, "utf8"))) {
					if (!allowed.has(name)) {
						undeclared.push(`${relative(root, file)} imports ${name}`);
					}
				}
			}
			expect(
				[...new Set(undeclared)].sort(),
				`Declare these in ${owner.manifest}`,
			).toEqual([]);
		});
	}
});
