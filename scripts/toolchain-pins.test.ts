import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./_lib";

/**
 * The Bun and Node versions are set in package.json ("packageManager" and
 * "engines"). mise.toml, the CI workflows, and scripts/codex-setup.sh must
 * agree with them, or contributors, CI, and agents run different toolchains.
 */

const read = (path: string) => readFileSync(join(repoRoot(), path), "utf8");
const pkg = JSON.parse(read("package.json")) as {
	packageManager: string;
	engines: { node: string; bun: string };
};
const mise = read("mise.toml");
const miseTool = (tool: string) =>
	mise.match(new RegExp(`^${tool}\\s*=\\s*"([^"]+)"`, "m"))?.[1];
const workflows = readdirSync(join(repoRoot(), ".github", "workflows"))
	.filter((file) => /\.ya?ml$/.test(file))
	.map((file) => ({
		file,
		text: read(join(".github", "workflows", file)),
	}));

/** [major, minor, patch] of "1.2.3" or ">=1.2.3". */
const version = (spec: string) =>
	spec
		.replace(/^>=/, "")
		.split(".")
		.map((part) => Number(part));
const atLeast = (a: number[], b: number[]) => {
	for (let i = 0; i < 3; i++) {
		if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
	}
	return true;
};

describe("toolchain pins agree", () => {
	const bun = pkg.packageManager.replace(/^bun@/, "");

	it("pins one Bun version: packageManager, engines.bun, mise.toml", () => {
		expect(pkg.packageManager).toMatch(/^bun@\d+\.\d+\.\d+$/);
		expect(pkg.engines.bun).toBe(`>=${bun}`);
		expect(miseTool("bun")).toBe(bun);
	});

	it("gives every workspace package the root's engines", () => {
		for (const name of readdirSync(join(repoRoot(), "packages"))) {
			const engines =
				(
					JSON.parse(read(join("packages", name, "package.json"))) as {
						engines?: Record<string, string>;
					}
				).engines ?? {};
			for (const [tool, range] of Object.entries(engines)) {
				expect({ name, tool, range }).toEqual({
					name,
					tool,
					range: pkg.engines[tool as "node" | "bun"],
				});
			}
		}
	});

	it("installs that Bun in every workflow", () => {
		for (const { file, text } of workflows) {
			const steps = text
				.split(/\n\s*- /)
				.filter((step) => step.includes("oven-sh/setup-bun"));
			for (const step of steps) {
				const pinned = step.match(/bun-version:\s*"?([^"\s]+)/)?.[1];
				const fromFile = step.match(/bun-version-file:\s*"?([^"\s]+)/)?.[1];
				// No version input: setup-bun reads packageManager too.
				const source = pinned ?? fromFile ?? "package.json";
				expect({ file, bun: source }).toEqual({
					file,
					bun: pinned ? bun : "package.json",
				});
			}
		}
	});

	it("needs a Node that Astro supports, and uses its major everywhere", () => {
		const astro = JSON.parse(
			read(join("node_modules", "astro", "package.json")),
		) as { engines: { node: string } };
		expect(pkg.engines.node).toMatch(/^>=\d+\.\d+\.\d+$/);
		expect(
			atLeast(version(pkg.engines.node), version(astro.engines.node)),
			`engines.node ${pkg.engines.node} allows Node versions Astro (${astro.engines.node}) refuses`,
		).toBe(true);

		const major = String(version(pkg.engines.node)[0]);
		expect(miseTool("node")).toBe(major);
		for (const { file, text } of workflows) {
			for (const match of text.matchAll(/node-version:\s*"?([^"\s]+)/g)) {
				expect({ file, node: match[1] }).toEqual({ file, node: major });
			}
			// A major alone resolves to the runner's cached Node, which can be
			// older than engines.node (22.23.3 against Astro's 22.23.4).
			const steps = text
				.split(/\n\s*- /)
				.filter((step) => step.includes("actions/setup-node"));
			for (const step of steps) {
				expect({
					file,
					checkLatest: /check-latest:\s*true/.test(step),
				}).toEqual({ file, checkLatest: true });
			}
		}
	});

	it("lets codex-setup.sh read its minimums from package.json", () => {
		const script = read(join("scripts", "codex-setup.sh"));
		expect(script).not.toMatch(/MIN_(BUN|NODE)_VERSION="\d/);
		expect(script).toContain("engines");
	});
});
