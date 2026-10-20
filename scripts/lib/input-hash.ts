import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * A hash of everything a check reads, so a check that passed can be skipped
 * while none of it has changed (check:types; never in CI).
 *
 * Inputs are folders and files under the repository root. A folder counts
 * every file git sees in it (tracked, and untracked but not ignored), by
 * path and content; `extra` adds files git ignores but a check still reads,
 * such as Astro's generated types.
 */
export const hashInputs = (
	root: string,
	inputs: readonly string[],
	extra: readonly string[] = [],
): string => {
	const listed = spawnSync(
		"git",
		[
			"ls-files",
			"-z",
			"--cached",
			"--others",
			"--exclude-standard",
			"--",
			...inputs,
		],
		{ cwd: root, encoding: "utf8" },
	);
	if (listed.status !== 0) {
		throw new Error(`git ls-files failed: ${listed.stderr.trim()}`);
	}
	const files = new Set(listed.stdout.split("\0").filter(Boolean));
	for (const path of extra) {
		const full = join(root, path);
		if (!existsSync(full)) continue;
		if (statSync(full).isDirectory()) {
			for (const entry of readdirSync(full, { recursive: true })) {
				const file = join(full, String(entry));
				if (statSync(file).isFile()) {
					files.add(relative(root, file).split(sep).join("/"));
				}
			}
		} else {
			files.add(path);
		}
	}
	const hash = createHash("sha256");
	for (const file of [...files].sort()) {
		const full = join(root, file);
		// git lists a tracked file deleted from the working tree; its absence counts.
		hash.update(file).update("\0");
		hash
			.update(existsSync(full) ? readFileSync(full) : "<deleted>")
			.update("\0");
	}
	return hash.digest("hex");
};
