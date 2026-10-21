import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	existsSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	realpathSync,
	statSync,
} from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * A hash of everything a check reads, so a check that passed can be skipped
 * while none of it has changed (check:types; never in CI).
 *
 * Inputs are folders and files under the repository root. A folder counts
 * every file git would list in it (tracked, and untracked but not ignored),
 * by path and content (`listInputFiles`); `extra` adds files git ignores but
 * a check still reads, such as Astro's generated types.
 */
export const hashInputs = (
	root: string,
	inputs: readonly string[],
	extra: readonly string[] = [],
): string => {
	const files = new Set(listInputFiles(root, inputs));
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
		hash.update(file).update("\0");
		hash.update(contentOf(full)).update("\0");
	}
	return hash.digest("hex");
};

/**
 * What a listed path holds: a file's bytes; for a link to a folder, where it
 * points (git lists a link, not what is behind it); for a tracked file
 * deleted from the working tree, which git still lists, its absence.
 */
const contentOf = (full: string): Buffer | string => {
	if (!existsSync(full)) return "<deleted>";
	return statSync(full).isDirectory()
		? `<link to ${readlinkSync(full)}>`
		: readFileSync(full);
};

/**
 * The files under `inputs` that git would list, as `/`-separated paths from
 * `root`: tracked ones, and untracked ones no .gitignore ignores. When `root`
 * is the top of a git repository, git lists them. Otherwise, in a project
 * before `git init` or one inside a repository that does not track it, they
 * are read from the disk, leaving out what the project's .gitignore files
 * ignore (`notIgnoredFiles`), plus whatever the enclosing repository lists.
 */
export const listInputFiles = (
	root: string,
	inputs: readonly string[],
): string[] => {
	const listed = gitListing(root, inputs);
	if (listed?.topLevel) return listed.files;
	return [
		...new Set([...(listed?.files ?? []), ...notIgnoredFiles(root, inputs)]),
	];
};

const git = (root: string, args: string[]) =>
	spawnSync("git", args, { cwd: root, encoding: "utf8" });

/** git's listing, or null where git cannot give one (no git, or no repository). */
const gitListing = (
	root: string,
	inputs: readonly string[],
): { files: string[]; topLevel: boolean } | null => {
	const top = git(root, ["rev-parse", "--show-toplevel"]);
	if (top.status !== 0) return null;
	const listed = git(root, [
		"ls-files",
		"-z",
		"--cached",
		"--others",
		"--exclude-standard",
		"--",
		...inputs,
	]);
	if (listed.status !== 0) return null;
	return {
		files: listed.stdout.split("\0").filter(Boolean),
		topLevel: realpathSync(top.stdout.trim()) === realpathSync(root),
	};
};

/** One .gitignore line, for paths under `base` (the .gitignore's folder; "" for `root`). */
type IgnoreRule = {
	base: string;
	pattern: RegExp;
	negated: boolean;
	foldersOnly: boolean;
};

/**
 * A gitignore glob as a regular expression over a `/`-separated path: `*`
 * and `?` stay within one folder, `**` crosses folders where it stands
 * alone between slashes, `[a-z]` and `[!a-z]` are classes, and a backslash
 * makes the next character literal.
 */
const globPattern = (glob: string): string => {
	let pattern = "";
	for (let index = 0; index < glob.length; index += 1) {
		const char = glob[index];
		if (char === "*" && glob[index + 1] === "*") {
			const alone =
				(index === 0 || glob[index - 1] === "/") &&
				(index + 2 === glob.length || glob[index + 2] === "/");
			if (alone && index + 2 === glob.length) {
				pattern += ".*";
				index += 1;
			} else if (alone) {
				pattern += "(?:.*/)?";
				index += 2;
			} else {
				pattern += "[^/]*";
				while (glob[index + 1] === "*") index += 1;
			}
		} else if (char === "*") {
			pattern += "[^/]*";
		} else if (char === "?") {
			pattern += "[^/]";
		} else if (char === "[") {
			const start = index + (/[!^]/.test(glob[index + 1] ?? "") ? 2 : 1);
			const end = glob.indexOf("]", start + 1);
			if (end < 0) {
				pattern += "\\[";
				continue;
			}
			const members = glob.slice(start, end).replace(/[\\\]^]/g, "\\$&");
			pattern += `[${start === index + 2 ? "^" : ""}${members}]`;
			index = end;
		} else if (char === "\\" && index + 1 < glob.length) {
			index += 1;
			pattern += glob[index].replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
		} else {
			pattern += char.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
		}
	}
	return pattern;
};

/** The rules of `<base>/.gitignore`, as git reads them. */
const ignoreRules = (root: string, base: string): IgnoreRule[] => {
	const file = join(root, base, ".gitignore");
	if (!existsSync(file)) return [];
	return readFileSync(file, "utf8")
		.split(/\r?\n/)
		.flatMap((raw): IgnoreRule[] => {
			// Trailing spaces do not count unless a backslash keeps one.
			let line = raw.replace(/(?<!\\) +$/, "");
			if (!line || line.startsWith("#")) return [];
			const negated = line.startsWith("!");
			if (negated) line = line.slice(1);
			const foldersOnly = line.endsWith("/") && !line.endsWith("\\/");
			if (foldersOnly) line = line.slice(0, -1);
			// A slash before the end ties the pattern to this folder; without
			// one it matches a name at any depth below it.
			const anchored = line.includes("/");
			const glob = globPattern(line.replace(/^\//, ""));
			return [
				{
					base,
					pattern: new RegExp(anchored ? `^${glob}$` : `^(?:.*/)?${glob}$`),
					negated,
					foldersOnly,
				},
			];
		});
};

/** Whether the last rule matching `path` ignores it (git's rule: the last match wins). */
const isIgnored = (
	rules: readonly IgnoreRule[],
	path: string,
	folder: boolean,
): boolean => {
	let ignored = false;
	for (const rule of rules) {
		if (rule.foldersOnly && !folder) continue;
		if (rule.base && !path.startsWith(`${rule.base}/`)) continue;
		const within = rule.base ? path.slice(rule.base.length + 1) : path;
		if (rule.pattern.test(within)) ignored = !rule.negated;
	}
	return ignored;
};

/**
 * The files under `inputs` that no .gitignore from `root` down ignores, the
 * way `git ls-files --others --exclude-standard` would list them in a new
 * repository at `root`: an ignored folder hides everything in it (a `!`
 * rule cannot bring a file back out of it), `.git` is never listed, and a
 * link is listed, not followed. Rules from outside the project (a global
 * excludes file, `.git/info/exclude`) are not read, so the list can only
 * hold more than git's, never less.
 */
export const notIgnoredFiles = (
	root: string,
	inputs: readonly string[],
): string[] => {
	const wanted = inputs.map((input) => input.replace(/\/+$/, ""));
	const files: string[] = [];
	const visit = (folder: string, inherited: readonly IgnoreRule[]) => {
		const rules = [...inherited, ...ignoreRules(root, folder)];
		const full = join(root, folder);
		for (const entry of readdirSync(full, { withFileTypes: true })) {
			if (entry.name === ".git") continue;
			const path = folder ? `${folder}/${entry.name}` : entry.name;
			const isFolder = entry.isDirectory();
			const inside = wanted.some(
				(input) => path === input || path.startsWith(`${input}/`),
			);
			const above =
				isFolder && wanted.some((input) => input.startsWith(`${path}/`));
			if ((!inside && !above) || isIgnored(rules, path, isFolder)) continue;
			if (isFolder) visit(path, rules);
			else files.push(path);
		}
	};
	visit("", []);
	return files.sort();
};
