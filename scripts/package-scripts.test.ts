import { describe, expect, it } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { listFilesRecursive, repoRoot } from "./_lib";

/**
 * The root package.json's scripts and the files in scripts/ stay in step: a
 * script names a file that exists, and every entrypoint in scripts/ is run by
 * something, so a dead script is deleted instead of left to rot.
 */

const root = repoRoot();
const scripts: Record<string, string> = JSON.parse(
	readFileSync(join(root, "package.json"), "utf8"),
).scripts;

/** Top-level files in scripts/ that run on their own; `_*.ts` are shared modules. */
const entrypoints = readdirSync(join(root, "scripts")).filter(
	(name) =>
		/\.(ts|sh)$/.test(name) &&
		!name.endsWith(".test.ts") &&
		!name.startsWith("_"),
);

/** Everything that can start a script: package scripts, code, CI, hooks, agent config. */
const callers = (except: string): string => {
	const texts = [JSON.stringify(scripts)];
	const read = (dir: string, filter: (file: string) => boolean) => {
		if (!existsSync(join(root, dir))) return;
		for (const file of listFilesRecursive(join(root, dir))) {
			if (filter(file)) texts.push(readFileSync(join(root, dir, file), "utf8"));
		}
	};
	read("scripts", (file) => file !== except && /\.(ts|mjs|sh)$/.test(file));
	read(
		"packages",
		(file) => /\.(ts|mjs)$/.test(file) && !file.includes("node_modules"),
	);
	read(".github", () => true);
	read(".husky", () => true);
	for (const file of [".mcp.json", ".lintstagedrc.json"]) {
		if (existsSync(join(root, file))) {
			texts.push(readFileSync(join(root, file), "utf8"));
		}
	}
	return texts.join("\n");
};

describe("package scripts", () => {
	it("name only files that exist", () => {
		const missing = Object.entries(scripts).flatMap(([name, command]) =>
			[...command.matchAll(/\bscripts\/[\w./-]+\.(?:ts|sh)\b/g)]
				.map(([path]) => path)
				.filter((path) => !existsSync(join(root, path)))
				.map((path) => `${name}: ${path}`),
		);
		expect(missing).toEqual([]);
	});

	it("leave no entrypoint in scripts/ that nothing runs", () => {
		// Callers name the file itself: "scripts/check-build.ts", runScript("verify.ts").
		const unused = entrypoints.filter((file) => !callers(file).includes(file));
		expect(unused).toEqual([]);
	});
});
