import { describe, expect, it } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planGates } from "../../../scripts/lib/verify-plan";
import {
	ENTRY_SCRIPTS,
	importSpecifiers,
	packageName,
	vendoredScripts,
} from "./copied-scripts";
import { readSource } from "./project";

const repoRoot = join(import.meta.dir, "../../..");

describe("vendoredScripts", () => {
	const vendored = vendoredScripts(repoRoot);

	it("copies every script the entry scripts reach, and nothing they cannot resolve", () => {
		expect(vendored.unresolved).toEqual([]);
		for (const entry of ENTRY_SCRIPTS) expect(vendored.files).toContain(entry);
		// Reached only through imports; the old hand-kept list missed both.
		expect(vendored.files).toContain("lib/load-book.ts");
		expect(vendored.files).toContain("lib/verify-plan.ts");
	});

	it("copies every script a project starts by its path", () => {
		// verify's gates, the bookkit CLI, and the MCP tools start these by path,
		// not by import, so the walk from ENTRY_SCRIPTS cannot reach them.
		const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");
		const handlers = "packages/astro-bookkit/src/mcp/tool-handlers";
		const sources = [
			read("scripts/bookkit.ts"),
			...readdirSync(join(repoRoot, handlers))
				.filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
				.map((name) => read(`${handlers}/${name}`)),
		];
		const started = new Set([
			...planGates(null, ["a-book"], () => true, "project").flatMap((gate) =>
				gate.commands
					.flat()
					.flatMap((arg) => arg.match(/^scripts\/([\w/.-]+\.ts)$/)?.[1] ?? []),
			),
			...sources.flatMap((source) =>
				[
					...source.matchAll(
						/runScript\(\s*"([\w/.-]+\.ts)"|"scripts\/([\w/.-]+\.ts)"/g,
					),
				].map((match) => match[1] ?? match[2]),
			),
		]);
		expect(started).toContain("validate-book.ts");
		expect(started).toContain("check-corpus.ts");
		for (const file of started) {
			expect({ file, vendored: vendored.files.includes(file) }).toEqual({
				file,
				vendored: true,
			});
		}
	});

	it("names the packages a project's root must install", () => {
		expect(vendored.packages).toContain("typescript");
	});

	it("gives every project script a vendored file to run", () => {
		const source = readSource(repoRoot);
		const scripts = new Set(source.scripts);
		for (const [name, command] of Object.entries(source.rootScripts)) {
			for (const [, file] of command.matchAll(/scripts\/([\w/.-]+\.ts)/g)) {
				expect({ name, file, vendored: scripts.has(file) }).toEqual({
					name,
					file,
					vendored: true,
				});
			}
			for (const [, other] of command.matchAll(/^bun run ([\w:][\w:-]*)/g)) {
				if (other === "scripts") continue;
				expect({
					name,
					runs: other,
					defined: other in source.rootScripts,
				}).toEqual({ name, runs: other, defined: true });
			}
		}
	});
});

describe("vendoredScripts, in a fixture repository", () => {
	it("follows imports and script files run by name, and reports what cannot resolve", () => {
		const root = mkdtempSync(join(tmpdir(), "vendored-scripts-"));
		const write = (rel: string, content: string) => {
			mkdirSync(join(root, rel, ".."), { recursive: true });
			writeFileSync(join(root, rel), content);
		};
		write(
			"scripts/cli.ts",
			`import { a } from "./lib/a";
import { engine } from "../packages/astro-bookkit/src/index";
import { gone } from "./lib/gone";
spawn(process.execPath, [join(root, "scripts", "lib", "dev.mjs")]);
runScript("check.ts");
`,
		);
		write("scripts/lib/a.ts", 'import ts from "typescript";\n');
		write("scripts/lib/dev.mjs", "export {};\n");
		write("scripts/check.ts", "export {};\n");
		write("scripts/unused.ts", "export {};\n");
		write("packages/astro-bookkit/src/index.ts", "export const engine = 1;\n");
		try {
			expect(vendoredScripts(root, ["cli.ts"])).toEqual({
				files: ["check.ts", "cli.ts", "lib/a.ts", "lib/dev.mjs"],
				packages: ["typescript"],
				unresolved: ["scripts/cli.ts imports ./lib/gone"],
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("importSpecifiers", () => {
	it("finds static, type-only, multi-line, dynamic, and require imports, not strings", () => {
		const source = `import { a } from "./a";
import type { B } from "../b";
export {
	c,
} from "./c";
import "./side-effect";
const lazy = await import("@scope/pkg/sub");
const required = require("pkg");
console.log(\`moving from "\${book}" to "books"\`);
`;
		expect(importSpecifiers(source)).toEqual([
			"./a",
			"../b",
			"./c",
			"./side-effect",
			"@scope/pkg/sub",
			"pkg",
		]);
		expect(packageName("@scope/pkg/sub")).toBe("@scope/pkg");
		expect(packageName("pkg/sub")).toBe("pkg");
	});
});
