import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listFilesRecursive } from "../../../scripts/_lib";
import { vendoredScripts } from "./copied-scripts";
import {
	createConflicts,
	createProject,
	isBookkitProject,
	isBookkitRepository,
	nextSteps,
	readSource,
	summarizeUpgrade,
	upgradeProject,
} from "./project";

/** create-bookkit's file ownership, in scratch folders outside the repository. */

const repoRoot = join(import.meta.dir, "../../..");
const source = readSource(repoRoot);
let dir: string;

const read = (rel: string) => readFileSync(join(dir, rel), "utf8");
const write = (rel: string, content: string) => {
	mkdirSync(join(dir, rel, ".."), { recursive: true });
	writeFileSync(join(dir, rel), content);
};
const chapter = "apps/garden/src/content/book/chapters/00-overview.mdx";

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "create-bookkit-"));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe("createProject", () => {
	it("vendors the engine, every script the CLI needs, and the lockfile", () => {
		createProject(source, dir, { book: "garden", title: "Garden" });

		expect(isBookkitProject(dir)).toBe(true);
		const engine = JSON.parse(read("packages/astro-bookkit/package.json"));
		// Kept, so the engine's lazy imports of it resolve.
		expect(Object.keys(engine.optionalDependencies)).toEqual([
			"@xenova/transformers",
		]);
		expect(
			listFilesRecursive(join(dir, "packages/astro-bookkit")).some((file) =>
				file.endsWith(".test.ts"),
			),
		).toBe(false);
		expect(vendoredScripts(dir).unresolved).toEqual([]);
		for (const script of [
			"bookkit.ts",
			"verify.ts",
			"check-build.ts",
			"lib/load-book.ts",
		]) {
			expect(existsSync(join(dir, "scripts", script))).toBe(true);
		}
		expect(read("bun.lock")).toBe(
			readFileSync(join(repoRoot, "bun.lock"), "utf8"),
		);

		const pkg = JSON.parse(read("package.json"));
		expect(pkg.scripts.deploy).toBe("bun run bookkit deploy --all");
		expect(pkg.scripts.verify).toBe("bun run scripts/verify.ts");
		expect(pkg.devDependencies.astro).toBe(source.versions.get("astro"));
		const app = JSON.parse(read("apps/garden/package.json"));
		expect(app.dependencies.astro).toBe(source.versions.get("astro"));
		expect(app.scripts.deploy).toBe(
			"bun run --cwd ../.. bookkit deploy garden",
		);

		const stamp = JSON.parse(read("bookkit.json"));
		expect(stamp.engine.version).toBe(source.engineVersion);
		expect(stamp.scripts).toEqual(source.scripts);
	});

	it("lists what it would overwrite; files it does not own are no conflict", () => {
		write("scripts/deploy-prod.sh", "#!/bin/sh\n");
		write("packages/mylib/index.ts", "export {};\n");
		write("README.md", "# Mine\n");
		expect(createConflicts(source, dir, "garden")).toEqual([]);

		const created = createProject(source, dir, {
			book: "garden",
			title: "Garden",
		});
		expect(created.keptExisting).toEqual(["README.md"]);
		expect(read("scripts/deploy-prod.sh")).toBe("#!/bin/sh\n");
		expect(read("packages/mylib/index.ts")).toBe("export {};\n");
		expect(read("README.md")).toBe("# Mine\n");

		expect(createConflicts(source, dir, "garden")).toEqual(
			expect.arrayContaining([
				"packages/astro-bookkit",
				"apps/garden",
				"package.json",
				"scripts/bookkit.ts",
			]),
		);
	});
});

describe("next steps", () => {
	it("check before git init, and deploy after the first commit", () => {
		createProject(source, dir, { book: "garden", title: "Garden" });
		for (const [steps, check] of [
			[
				nextSteps(dir, { installed: false, book: "garden" }),
				"bun run bookkit check",
			],
			[read("README.md"), "bun run verify -- --all"],
		] as const) {
			const at = (text: string) => steps.indexOf(text);
			expect(at(check)).toBeGreaterThan(-1);
			expect(at("git init")).toBeGreaterThan(at(check));
			expect(at("bun run deploy -- --dry-run")).toBeGreaterThan(
				at("git commit"),
			);
		}
		expect(nextSteps(dir, { installed: true, book: "garden" })).not.toContain(
			"bun install",
		);
	});
});

describe("upgradeProject", () => {
	it("replaces the engine's files, never the author's, and says what changed", () => {
		createProject(source, dir, { book: "garden", title: "Garden" });
		const authored = {
			[chapter]: `${read(chapter)}\nThe author's own paragraph.\n`,
			"apps/garden/src/book.config.ts": read(
				"apps/garden/src/book.config.ts",
			).replace('"Garden"', '"The Garden"'),
			// A page the book keeps, replacing the engine's.
			"apps/garden/src/pages/read/examples/index.astro":
				"---\n---\n<h1>The author's own examples</h1>\n",
			"scripts/mine.sh": "#!/bin/sh\n",
		};
		for (const [rel, content] of Object.entries(authored)) write(rel, content);
		write("apps/garden/astro.config.mjs", "// drifted shim\n");
		write("packages/astro-bookkit/src/index.ts", "// edited engine\n");
		rmSync(join(dir, "apps/garden/TODOS.md"));
		const stamp = JSON.parse(read("bookkit.json"));
		write(
			"bookkit.json",
			JSON.stringify({
				...stamp,
				engine: { version: "0.0.9", commit: "abc1234" },
			}),
		);

		const result = upgradeProject(source, dir);

		for (const [rel, content] of Object.entries(authored)) {
			expect(read(rel)).toBe(content);
		}
		expect(read("apps/garden/astro.config.mjs")).toBe(
			readFileSync(
				join(
					repoRoot,
					"packages/astro-bookkit/templates/book-app/astro.config.mjs",
				),
				"utf8",
			),
		);
		expect(read("packages/astro-bookkit/src/index.ts")).toBe(
			readFileSync(
				join(repoRoot, "packages/astro-bookkit/src/index.ts"),
				"utf8",
			),
		);
		expect(read("apps/garden/TODOS.md")).toStartWith("# The Garden: TODOs");
		expect(result.untouchedScripts).toEqual(["mine.sh"]);

		const summary = summarizeUpgrade(result).join("\n");
		expect(summary).toContain(
			`Engine 0.0.9 (abc1234) → ${source.engineVersion}`,
		);
		expect(summary).toContain(
			"packages/astro-bookkit/: 1 replaced, 0 added, 0 removed",
		);
		expect(summary).toContain("replaced apps/garden/astro.config.mjs");
		expect(summary).toContain("added    apps/garden/TODOS.md");
		expect(summary).toContain(
			"Left in place (not written by this version): scripts/mine.sh",
		);
		expect(summary).not.toContain(chapter);
	});

	describe.each([
		{
			what: "shared page",
			file: "src/pages/read/glossary/index.astro",
			from: "book-app",
			saved: "src/pages/read/glossary/_index.astro.before-upgrade",
		},
		{
			what: "runtime wiring",
			file: "src/lib/book-runtime.ts",
			from: "book-app",
			saved: "src/lib/_book-runtime.ts.before-upgrade",
		},
		{
			what: "starter page",
			file: "src/pages/read/examples/index.astro",
			from: "starter",
			saved: "src/pages/read/examples/_index.astro.before-upgrade",
		},
	])(
		"a $what an earlier engine wrote into the book, which the engine now serves",
		({ file, from, saved }) => {
			const page = `apps/garden/${file}`;
			const savedAs = `apps/garden/${saved}`;
			const oldCopy = "---\n---\n<h1>As the earlier engine wrote it</h1>\n";

			/** A project whose engine shipped `file` as a shim or a starter file. */
			const olderProject = (content: string) => {
				createProject(source, dir, { book: "garden", title: "Garden" });
				write(`packages/astro-bookkit/templates/${from}/${file}`, oldCopy);
				write(page, content);
			};

			it("removes the unedited copy, and the folders it leaves empty", () => {
				olderProject(oldCopy);
				const result = upgradeProject(source, dir);
				expect(existsSync(join(dir, page))).toBe(false);
				expect(existsSync(join(dir, page, ".."))).toBe(false);
				expect(existsSync(join(dir, savedAs))).toBe(false);
				expect(result.changes).toContainEqual({
					path: page,
					action: "removed",
				});
			});

			it("saves an edited copy beside it, where nothing reads it, and says where", () => {
				const edited = `${oldCopy}<p>The author's own words.</p>\n`;
				olderProject(edited);
				const result = upgradeProject(source, dir);
				expect(existsSync(join(dir, page))).toBe(false);
				expect(read(savedAs)).toBe(edited);
				const summary = summarizeUpgrade(result).join("\n");
				expect(summary).toContain(`removed  ${page}`);
				expect(summary).toContain(
					`${page} is served by the engine from this version on, so your edited copy was removed and saved as ${savedAs}.`,
				);

				// A second upgrade has nothing left to save.
				const again = summarizeUpgrade(upgradeProject(source, dir)).join("\n");
				expect(again).not.toContain("before-upgrade");
			});
		},
	);

	it("removes only the scripts an earlier version vendored", () => {
		createProject(source, dir, { book: "garden", title: "Garden" });
		write("scripts/retired.ts", "// vendored by an older version\n");
		const stamp = JSON.parse(read("bookkit.json"));
		write(
			"bookkit.json",
			JSON.stringify({ ...stamp, scripts: [...stamp.scripts, "retired.ts"] }),
		);
		const result = upgradeProject(source, dir);
		expect(existsSync(join(dir, "scripts/retired.ts"))).toBe(false);
		expect(result.changes).toContainEqual({
			path: "scripts/retired.ts",
			action: "removed",
		});
	});
});

describe("project detection", () => {
	it("tells a project from the bookkit repository and from other folders", () => {
		expect(isBookkitProject(dir)).toBe(false);
		expect(isBookkitRepository(repoRoot)).toBe(true);
		createProject(source, dir, { book: "garden", title: "Garden" });
		expect(isBookkitRepository(dir)).toBe(false);
	});
});
