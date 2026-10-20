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
		// Kept, so the engine's lazy imports of them resolve.
		expect(Object.keys(engine.optionalDependencies)).toEqual(
			expect.arrayContaining(["@xenova/transformers", "@mlc-ai/web-llm"]),
		);
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

describe("upgradeProject", () => {
	it("replaces the engine's files, never the author's, and says what changed", () => {
		createProject(source, dir, { book: "garden", title: "Garden" });
		const authored = {
			[chapter]: `${read(chapter)}\nThe author's own paragraph.\n`,
			"apps/garden/src/book.config.ts": read(
				"apps/garden/src/book.config.ts",
			).replace('"Garden"', '"The Garden"'),
			"apps/garden/src/pages/read/mechanisms/index.astro": `${read("apps/garden/src/pages/read/mechanisms/index.astro")}\n<!-- edited -->\n`,
			"scripts/mine.sh": "#!/bin/sh\n",
		};
		for (const [rel, content] of Object.entries(authored)) write(rel, content);
		write("apps/garden/src/pages/404.astro", "drifted shim\n");
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
		expect(read("apps/garden/src/pages/404.astro")).toBe(
			readFileSync(
				join(
					repoRoot,
					"packages/astro-bookkit/templates/book-app/src/pages/404.astro",
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
		expect(summary).toContain("replaced apps/garden/src/pages/404.astro");
		expect(summary).toContain("added    apps/garden/TODOS.md");
		expect(summary).toContain(
			"Left in place (not written by this version): scripts/mine.sh",
		);
		expect(summary).not.toContain(chapter);
	});

	describe("a home page from an engine that left it to the book", () => {
		const home = "apps/garden/src/pages/index.astro";
		const shim =
			"packages/astro-bookkit/templates/book-app/src/pages/index.astro";
		const oldStarter = "---\n---\n<h1>The old starter's home page</h1>\n";

		/** A project whose engine had the home page in its starter, not its shims. */
		const olderProject = (homePage: string) => {
			createProject(source, dir, { book: "garden", title: "Garden" });
			rmSync(join(dir, shim));
			write(
				"packages/astro-bookkit/templates/starter/src/pages/index.astro",
				oldStarter,
			);
			write(home, homePage);
		};
		const sharedHomePage = () => readFileSync(join(repoRoot, shim), "utf8");

		it("replaces the starter's copy with the shared page", () => {
			olderProject(oldStarter);
			const result = upgradeProject(source, dir);
			expect(read(home)).toBe(sharedHomePage());
			expect(
				existsSync(
					join(dir, "apps/garden/src/pages/_index.astro.before-upgrade"),
				),
			).toBe(false);
			expect(result.changes).toContainEqual({ path: home, action: "replaced" });
		});

		it("saves an edited copy beside it, out of Astro's way, and says where", () => {
			const edited = `${oldStarter}<p>The author's own welcome.</p>\n`;
			olderProject(edited);
			const result = upgradeProject(source, dir);
			expect(read(home)).toBe(sharedHomePage());
			expect(read("apps/garden/src/pages/_index.astro.before-upgrade")).toBe(
				edited,
			);
			const summary = summarizeUpgrade(result).join("\n");
			expect(summary).toContain(`replaced ${home}`);
			expect(summary).toContain(
				`${home} is shared by every book from this version on, so your edited copy was replaced and saved as apps/garden/src/pages/_index.astro.before-upgrade.`,
			);

			// A second upgrade has nothing left to save.
			const again = summarizeUpgrade(upgradeProject(source, dir)).join("\n");
			expect(again).not.toContain("before-upgrade");
		});
	});

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
