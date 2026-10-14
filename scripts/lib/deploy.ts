import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

/**
 * What `bookkit deploy` needs to publish books all at once and from a known
 * commit: which folders under apps/ are books, the commit and uncommitted
 * changes, the stamp recording what a deploy run built and checked, and the
 * page-count comparison against what is live. `scripts/deploy.ts` runs them.
 */

/** The files that make a folder under apps/ a book `deploy` can publish. */
export const BOOK_MARKERS = ["src/book.config.ts", "wrangler.jsonc"] as const;

export type BookDiscovery = {
	/** Folders with every marker, sorted. */
	books: string[];
	/** Other folders under apps/, and the markers each lacks. */
	skipped: Array<{ dir: string; missing: string[] }>;
};

export const findDeployableBooks = (appsDir: string): BookDiscovery => {
	const dirs = existsSync(appsDir)
		? readdirSync(appsDir, { withFileTypes: true })
				.filter((entry) => entry.isDirectory())
				.map((entry) => entry.name)
				.sort()
		: [];
	const books: string[] = [];
	const skipped: BookDiscovery["skipped"] = [];
	for (const dir of dirs) {
		const missing = BOOK_MARKERS.filter(
			(marker) => !existsSync(join(appsDir, dir, marker)),
		);
		if (missing.length === 0) books.push(dir);
		else skipped.push({ dir, missing });
	}
	return { books, skipped };
};

export type GitState = {
	commit: string;
	subject: string;
	/** `git status --porcelain` lines outside the excluded paths. */
	dirty: string[];
};

/**
 * HEAD and the uncommitted changes under `root`, leaving out `exclude`
 * (repo-relative paths, e.g. the apps/ folders of books not being deployed).
 */
export const readGitState = (
	root: string,
	exclude: string[] = [],
): GitState | { error: string } => {
	const git = (args: string[]) =>
		spawnSync("git", ["-c", "core.quotepath=off", ...args], {
			cwd: root,
			encoding: "utf8",
		});
	const head = git(["rev-parse", "--verify", "HEAD"]);
	if (head.error) return { error: `git did not run (${head.error.message})` };
	if (head.status !== 0) {
		return {
			error: `${root} is not a git checkout with a commit (${head.stderr.trim()})`,
		};
	}
	const status = git([
		"status",
		"--porcelain",
		"--untracked-files=all",
		"--",
		".",
		...exclude.map((path) => `:(exclude)${path}`),
	]);
	if (status.status !== 0) {
		return { error: `git status failed: ${status.stderr.trim()}` };
	}
	return {
		commit: head.stdout.trim(),
		subject: git(["log", "-1", "--format=%s"]).stdout.trim(),
		dirty: status.stdout.split("\n").filter(Boolean),
	};
};

/** Cloudflare keeps at most 100 characters of a Worker version's message. */
export const VERSION_MESSAGE_LIMIT = 100;

/** The `--message` each published Worker version carries: commit, then subject. */
export const versionMessage = (
	git: GitState | null,
	uncommitted: boolean,
): string => {
	const message = git
		? `${git.commit.slice(0, 12)}${uncommitted ? "+uncommitted" : ""} ${git.subject}`
		: "uncommitted build outside a git checkout";
	return message.length > VERSION_MESSAGE_LIMIT
		? `${message.slice(0, VERSION_MESSAGE_LIMIT - 1)}…`
		: message;
};

/** sha256 over every file's path and bytes under `dir`, in sorted order. */
export const distDigest = (dir: string): string => {
	const hash = createHash("sha256");
	const visit = (relDir: string) => {
		const entries = readdirSync(join(dir, relDir), { withFileTypes: true })
			.map((entry) => ({
				rel: relDir ? `${relDir}/${entry.name}` : entry.name,
				entry,
			}))
			.sort((a, b) => (a.rel < b.rel ? -1 : 1));
		for (const { rel, entry } of entries) {
			if (entry.isDirectory()) visit(rel);
			else if (entry.isFile()) {
				hash.update(`${rel}\0`);
				hash.update(readFileSync(join(dir, rel)));
				hash.update("\0");
			}
		}
	};
	visit("");
	return hash.digest("hex");
};

/**
 * What a deploy run built and checked: written once a book's fresh build passed
 * verify, check:build, and the page count, and read by `--no-build`. It sits
 * beside dist/ rather than in it, so it is not uploaded.
 */
export type DeployStamp = {
	book: string;
	commit: string;
	/** Built with uncommitted changes (`--allow-dirty`). */
	uncommitted: boolean;
	/** `distDigest` of dist/ when it passed. */
	digest: string;
	checkedAt: string;
};

export const stampPath = (appDir: string): string =>
	join(appDir, ".bookkit", "deploy-stamp.json");

export const writeStamp = (appDir: string, stamp: DeployStamp) => {
	const path = stampPath(appDir);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(stamp, null, "\t")}\n`);
};

export const readStamp = (appDir: string): DeployStamp | null => {
	try {
		return JSON.parse(readFileSync(stampPath(appDir), "utf8")) as DeployStamp;
	} catch {
		return null;
	}
};

/** Why `--no-build` must not publish this dist/, or null when it may. */
export const stampProblem = ({
	book,
	stamp,
	commit,
	digest,
	allowUncommitted,
}: {
	book: string;
	stamp: DeployStamp | null;
	commit: string;
	/** `distDigest` of dist/ now, or null when there is no dist/. */
	digest: string | null;
	allowUncommitted: boolean;
}): string | null => {
	const rebuild = `Run bun run bookkit deploy ${book} --dry-run to build, check, and stamp it, or deploy without --no-build.`;
	if (!stamp) {
		return `apps/${book}/dist/ has no deploy stamp, so nothing shows which commit it was built from or that it passed the deploy checks. ${rebuild}`;
	}
	if (stamp.commit !== commit) {
		return `apps/${book}/dist/ was built at ${stamp.commit.slice(0, 12)}, but HEAD is ${commit.slice(0, 12)}. ${rebuild}`;
	}
	if (stamp.uncommitted && !allowUncommitted) {
		return `apps/${book}/dist/ was built with uncommitted changes. Commit them and rebuild, or pass --allow-dirty to publish it anyway.`;
	}
	if (digest !== stamp.digest) {
		return `apps/${book}/dist/ ${digest === null ? "is gone" : "changed"} since bookkit deploy checked it (a rebuild or an edit). ${rebuild}`;
	}
	return null;
};

/** The number of <loc> entries in a sitemap.xml. */
export const countSitemapUrls = (xml: string): number =>
	xml.match(/<loc>[^<]+<\/loc>/g)?.length ?? 0;

/** Refuse a publish that would remove more than this share of the live pages. */
export const PAGE_DROP_LIMIT = 0.25;

/** Why publishing `next` sitemap pages over `live` ones looks like a mistake, or null. */
export const pageDropProblem = ({
	live,
	next,
	liveUrl,
}: {
	live: number;
	next: number;
	liveUrl: string;
}): string | null =>
	live > 0 && next < live * (1 - PAGE_DROP_LIMIT)
		? `its sitemap lists ${next} page(s), but ${live} are live (${liveUrl}): more than ${PAGE_DROP_LIMIT * 100}% would disappear. If pages were removed on purpose, rerun with --allow-page-drop.`
		: null;
