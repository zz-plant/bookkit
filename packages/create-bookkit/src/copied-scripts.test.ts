import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { COPIED_SCRIPTS } from "./copied-scripts";

const repoRoot = join(import.meta.dir, "../../..");
const scriptsDir = join(repoRoot, "scripts");

/** Relative module specifiers, including type-only imports. */
const relativeImports = (source: string): string[] =>
	[
		...source.matchAll(/(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g),
	].map((match) => match[1]);

const resolveModule = (from: string, specifier: string): string | undefined => {
	const base = join(dirname(from), specifier);
	return [base, `${base}.ts`, join(base, "index.ts")].find((path) =>
		existsSync(path),
	);
};

describe("create-bookkit copied scripts", () => {
	it("only import what a standalone project has", () => {
		const copied = new Set(COPIED_SCRIPTS.map((rel) => join(scriptsDir, rel)));
		const missing: string[] = [];
		for (const rel of COPIED_SCRIPTS) {
			const file = join(scriptsDir, rel);
			for (const specifier of relativeImports(readFileSync(file, "utf8"))) {
				const target = resolveModule(file, specifier);
				const vendored =
					target !== undefined &&
					relative(repoRoot, target).startsWith("packages/astro-bookkit/");
				if (!target || !(copied.has(target) || vendored)) {
					missing.push(`scripts/${rel} imports ${specifier}`);
				}
			}
		}
		expect(missing).toEqual([]);
	});
});
