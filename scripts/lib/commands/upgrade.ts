import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { repoRoot } from "../../_lib";
import { flagValue } from "../cli";
import { args } from "./context";

const DEFAULT_REPO_URL = "https://github.com/zz-plant/bookkit.git";

/**
 * `bookkit upgrade [--dir <project>] [--source <repo>] [--ref <git-ref>]`
 *
 * Updates a standalone Bookkit project's vendored engine, scripts, and shared
 * wrappers from a local bookkit repository checkout (--source) or by shallow-
 * cloning the upstream repository (--ref).
 */
export const upgradeCommand = (): number => {
	const rest = args.slice(1);
	const dirArg = flagValue(rest, "--dir");
	const sourceArg = flagValue(rest, "--source");
	const refArg = flagValue(rest, "--ref");

	const target = dirArg ? resolve(dirArg) : repoRoot();
	if (!existsSync(join(target, "bookkit.json"))) {
		if (
			!dirArg &&
			existsSync(join(target, "packages", "create-bookkit", "package.json"))
		) {
			console.error(
				`${target} is the bookkit repository itself; update it with git, or pass --dir <standalone-project> to upgrade a project made by create-bookkit.`,
			);
			return 1;
		}
		console.error(
			`${target} is not a standalone Bookkit project (missing bookkit.json).`,
		);
		return 1;
	}

	const runFromSource = (sourceDir: string): number => {
		const entry = join(
			sourceDir,
			"packages",
			"create-bookkit",
			"src",
			"index.ts",
		);
		if (!existsSync(entry)) {
			console.error(
				`Source ${sourceDir} does not contain packages/create-bookkit/src/index.ts.`,
			);
			return 1;
		}
		const run = spawnSync(
			process.execPath,
			["run", entry, target, "--upgrade", "--source", sourceDir],
			{ stdio: "inherit" },
		);
		return run.status ?? 1;
	};

	if (sourceArg) {
		return runFromSource(resolve(sourceArg));
	}

	const cloneDir = mkdtempSync(join(tmpdir(), "bookkit-upgrade-"));
	try {
		const repoUrl = process.env.BOOKKIT_REPO_URL || DEFAULT_REPO_URL;
		const cloneArgs = ["clone", "--depth", "1", "--quiet"];
		if (refArg) cloneArgs.push("--branch", refArg);
		cloneArgs.push(repoUrl, cloneDir);
		console.log(
			`Fetching Bookkit engine source from ${repoUrl}${refArg ? ` (${refArg})` : ""}...`,
		);
		const clone = spawnSync("git", cloneArgs, { stdio: "inherit" });
		if (clone.status !== 0) {
			console.error(
				`git clone exited with status ${clone.status}. Check network access or pass --source <local-bookkit-repo>.`,
			);
			return clone.status ?? 1;
		}
		return runFromSource(cloneDir);
	} finally {
		rmSync(cloneDir, { recursive: true, force: true });
	}
};
