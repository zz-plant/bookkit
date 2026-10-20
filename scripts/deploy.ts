import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { repoRoot } from "./_lib";
import { loadBookConfigSummary } from "./lib/authoring";
import { didYouMean, readFocusBook } from "./lib/cli";
import {
	countSitemapUrls,
	distDigest,
	findDeployableBooks,
	type GitState,
	pageDropProblem,
	readGitState,
	readStamp,
	stampPath,
	stampProblem,
	versionMessage,
	writeStamp,
} from "./lib/deploy";
import { domainNotice, liveSitemapUrl } from "./lib/deploy-domain";

/**
 * bookkit deploy — publishes books to Cloudflare Workers, all or none.
 *
 * 1. Checks, for every book before any is published: `verify --all` (what CI
 *    runs, less its build of every book), then each deployed book's build,
 *    check:build, and its page count against the live sitemap. One failure
 *    and nothing is published.
 * 2. Publishes each book with wrangler; the version message names the commit.
 *
 * Uncommitted changes in the books being deployed, or outside apps/, are
 * refused unless --allow-dirty; a --dry-run rehearses them anyway, and says
 * a real deploy would refuse them. A book that passes gets a stamp beside its
 * dist/ (commit + digest); --no-build publishes that stamped dist/ without
 * verifying or building again, and refuses one stamped at another commit or
 * changed since.
 */

const USAGE = `Usage: bun run bookkit deploy [book...] [--all] [--dry-run] [--no-build] [--allow-dirty] [--allow-page-drop]

Publishes books to Cloudflare Workers, all or none: every book is verified,
built, and checked before any is published. With no book named, the current
book (bun run bookkit use), else every book under apps/ that has
src/book.config.ts and wrangler.jsonc.

  --all              every book, even when a current book is set
  --dry-run          run every check and wrangler's dry run; publish nothing
  --no-build         skip verify and the build: publish the dist/ an earlier
                     deploy run built, checked, and stamped at this commit
  --allow-dirty      publish with uncommitted changes (the version message says so)
  --allow-page-drop  publish even if more than a quarter of the live pages would disappear`;

const parse = () =>
	parseArgs({
		args: process.argv.slice(2),
		allowPositionals: true,
		options: {
			all: { type: "boolean", default: false },
			"dry-run": { type: "boolean", default: false },
			"no-build": { type: "boolean", default: false },
			"allow-dirty": { type: "boolean", default: false },
			"allow-page-drop": { type: "boolean", default: false },
			help: { type: "boolean", short: "h", default: false },
		},
	});
let options: ReturnType<typeof parse>;
try {
	options = parse();
} catch (error) {
	// An unknown flag (say, --dryrun) must not fall through to a real publish.
	console.error(
		`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`,
	);
	process.exit(1);
}
if (options.values.help) {
	console.log(USAGE);
	process.exit(0);
}

const dryRun = options.values["dry-run"];
const skipBuild = options.values["no-build"];
const allowDirty = options.values["allow-dirty"];
const allowPageDrop = options.values["allow-page-drop"];

const root = repoRoot();
const appsDir = join(root, "apps");
const { books: deployable, skipped } = findDeployableBooks(appsDir);

for (const { dir, missing } of skipped) {
	console.log(
		`Skipping apps/${dir}: it has no ${missing.join(" or ")}, so it is not a book deploy can publish.`,
	);
}

const named = [...new Set(options.positionals)].sort();
for (const book of named) {
	if (deployable.includes(book)) continue;
	const stray = skipped.find((entry) => entry.dir === book);
	console.error(
		stray
			? `apps/${book} cannot be deployed: it has no ${stray.missing.join(" or ")}.`
			: `Book "${book}" not found.${didYouMean(book, deployable)} Deployable books: ${deployable.join(", ") || "none"}.`,
	);
	process.exit(1);
}
// No book named: the current book (`bookkit use`), unless --all.
const focusBook = options.values.all ? undefined : readFocusBook(deployable);
const selected =
	named.length > 0 ? named : focusBook ? [focusBook] : deployable;
if (named.length === 0 && focusBook) {
	console.log(
		`Deploying ${focusBook}, the current book. Add --all for every book.`,
	);
}
if (selected.length === 0) {
	console.error(
		"No books to deploy: no folder under apps/ has both src/book.config.ts and wrangler.jsonc.",
	);
	process.exit(1);
}

const wranglerBin = join(root, "node_modules", ".bin", "wrangler");
if (!existsSync(wranglerBin)) {
	console.error(
		"wrangler is not installed. Run `bun install`; it is a workspace devDependency.",
	);
	process.exit(1);
}

// Provenance. Folders of books not being deployed may hold work in progress.
const others = [...deployable, ...skipped.map((entry) => entry.dir)]
	.filter((dir) => !selected.includes(dir))
	.map((dir) => `apps/${dir}`);
const git = readGitState(root, others);
const gitState: GitState | null = "error" in git ? null : git;
const gitError = "error" in git ? git.error : null;
const changes = gitState?.dirty ?? [];
const uncommitted = gitState === null || changes.length > 0;
/** A few of the changes, so the advice is not buried under all of them. */
const listChanges = (limit = 10) => [
	...changes.slice(0, limit).map((line) => `  ${line}`),
	...(changes.length > limit
		? [`  … and ${changes.length - limit} more (git status lists them)`]
		: []),
];
// A dry run rehearses uncommitted work; it stamps nothing, so nothing
// rehearsed this way can be published with --no-build.
const rehearsingUncommitted = uncommitted && !allowDirty && dryRun;
if (uncommitted && !allowDirty && !dryRun) {
	console.error(
		gitState === null
			? `Refusing to deploy: ${gitError}. Deploy records the commit it publishes; commit the books to git, or pass --allow-dirty to publish without one.`
			: [
					`Refusing to deploy: ${changes.length} uncommitted change(s) would be published, or be missing from what is published. Commit or stash them and rerun, or pass --allow-dirty to publish the working tree as it is.`,
					...listChanges(),
				].join("\n"),
	);
	process.exit(1);
}
if (rehearsingUncommitted) {
	console.warn(
		[
			"",
			`Rehearsing uncommitted work: a real deploy refuses ${gitState === null ? "a folder that is not a git checkout" : `these ${changes.length} change(s)`} until they are committed (or with --allow-dirty).`,
			...(gitState === null ? [] : listChanges(5)),
		].join("\n"),
	);
} else if (uncommitted) {
	console.warn(
		[
			"",
			"WARNING: --allow-dirty: publishing work that is in no commit. It cannot be rebuilt or rolled back from git.",
			...(gitState === null ? [`  ${gitError}`] : listChanges()),
			`The version message on Cloudflare says "${versionMessage(gitState, true)}".`,
			"",
		].join("\n"),
	);
}
if (skipBuild && rehearsingUncommitted) {
	console.error(
		"--no-build publishes a dist/ an earlier deploy run stamped, and a dry run of uncommitted work stamps none. Commit, then deploy.",
	);
	process.exit(1);
}
if (skipBuild && gitState === null) {
	console.error(
		"--no-build compares dist/ with the commit it was built from, and this is not a git checkout. Deploy without --no-build.",
	);
	process.exit(1);
}

const where = gitState
	? `${gitState.commit.slice(0, 12)}${uncommitted ? " + uncommitted changes" : ""} "${gitState.subject}"`
	: "an uncommitted working tree";
console.log(
	`\nDEPLOY  ${selected.join(", ")}  at ${where}${dryRun ? "  (dry run: nothing is published)" : ""}`,
);

type Outcome = {
	book: string;
	problems: string[];
	/** Set when the book was never reached. */
	unchecked?: string;
	pages?: string;
	published?: boolean;
};
const outcomes: Outcome[] = selected.map((book) => ({ book, problems: [] }));

const printSummary = (headline: string) => {
	const width = Math.max(...selected.map((book) => book.length));
	console.log(`\nDEPLOY SUMMARY  ${where}${dryRun ? "  (dry run)" : ""}`);
	for (const outcome of outcomes) {
		const status =
			outcome.unchecked ??
			(outcome.problems.length > 0
				? `refused: ${outcome.problems.join(" ")}`
				: outcome.published === undefined
					? "passed its checks; not published"
					: outcome.published
						? dryRun
							? "passed; wrangler dry run ok"
							: "published"
						: dryRun
							? "wrangler dry run failed"
							: "failed to publish; still serves its previous version");
		console.log(`  ${outcome.book.padEnd(width)}  ${status}`);
		if (outcome.pages) console.log(`  ${" ".repeat(width)}  ${outcome.pages}`);
	}
	console.log(`\n${headline}`);
};

/** The number of pages in the live sitemap, or why it could not be read. */
const liveSitemapCount = async (
	url: string,
): Promise<{ count: number; url: string } | { unknown: string }> => {
	try {
		const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
		if (response.status === 404)
			return { unknown: `nothing is live at ${url}` };
		if (!response.ok) {
			return { unknown: `${url} answered HTTP ${response.status}` };
		}
		return { count: countSitemapUrls(await response.text()), url };
	} catch (error) {
		return {
			unknown: `could not read ${url} (${error instanceof Error ? error.message : String(error)})`,
		};
	}
};

console.log(
	"\n1/2  CHECK every book; nothing is published unless all of them pass",
);
if (skipBuild) {
	console.log(
		"\nSkipping verify --all and the build (--no-build): publishing the dist/ an earlier deploy run checked and stamped.",
	);
} else {
	// Every check CI runs, except building every book: the books being
	// deployed are built and checked below.
	console.log(
		"\n── verify --all (the checks CI runs; the books deployed are built below)\n",
	);
	const verify = spawnSync(
		process.execPath,
		["run", "verify", "--", "--all", "--skip", "build:all"],
		{ cwd: root, stdio: "inherit" },
	);
	if (verify.status !== 0) {
		for (const outcome of outcomes) {
			outcome.unchecked = "not checked: verify --all failed first";
		}
		printSummary(
			"Nothing was published: verify --all failed (its report is above). Fix what it lists, run bun run verify -- --all until it passes, and deploy again.",
		);
		process.exit(1);
	}
}

for (const outcome of outcomes) {
	const { book } = outcome;
	const appDir = join(appsDir, book);
	const distDir = join(appDir, "dist");
	console.log(`\n── ${book}\n`);

	if (skipBuild && gitState) {
		const problem = stampProblem({
			book,
			stamp: readStamp(appDir),
			commit: gitState.commit,
			digest: existsSync(distDir) ? distDigest(distDir) : null,
			allowUncommitted: allowDirty,
		});
		if (problem) {
			console.log(problem);
			outcome.problems.push(problem);
			continue;
		}
	} else {
		rmSync(stampPath(appDir), { force: true });
		const build = spawnSync(process.execPath, ["run", "build"], {
			cwd: appDir,
			stdio: "inherit",
		});
		if (build.status !== 0) {
			outcome.problems.push(
				`its build failed (${build.status === null ? `killed by ${build.signal}` : `exit ${build.status}`}); the build output is above.`,
			);
			continue;
		}
	}

	const check = spawnSync(
		process.execPath,
		["run", join(root, "scripts", "check-build.ts"), "--book", book],
		{ cwd: root, stdio: "inherit" },
	);
	if (check.status !== 0) {
		outcome.problems.push(
			"its dist/ failed check:build; the findings are above.",
		);
		continue;
	}

	const siteUrl = (await loadBookConfigSummary(book)).site?.url;
	const wranglerJsonc = readFileSync(join(appDir, "wrangler.jsonc"), "utf8");
	const notice = domainNotice({ book, siteUrl, wranglerJsonc });
	if (notice) console.log(`\nNote for ${book}: ${notice}`);

	const next = countSitemapUrls(
		readFileSync(join(distDir, "sitemap.xml"), "utf8"),
	);
	const live = liveSitemapUrl({ siteUrl, wranglerJsonc });
	const liveCount = "url" in live ? await liveSitemapCount(live.url) : live;
	if ("unknown" in liveCount) {
		outcome.pages = `${next} sitemap page(s); not compared with the live site: ${liveCount.unknown}.`;
	} else {
		const drop = pageDropProblem({
			live: liveCount.count,
			next,
			liveUrl: liveCount.url,
		});
		outcome.pages = `${next} sitemap page(s); ${liveCount.count} live.${drop && allowPageDrop ? " Fewer pages allowed (--allow-page-drop)." : ""}`;
		if (drop && !allowPageDrop) outcome.problems.push(drop);
	}
	console.log(`\nPages: ${outcome.pages}`);

	if (
		outcome.problems.length === 0 &&
		!skipBuild &&
		gitState &&
		!rehearsingUncommitted
	) {
		writeStamp(appDir, {
			book,
			commit: gitState.commit,
			uncommitted,
			digest: distDigest(distDir),
			checkedAt: new Date().toISOString(),
		});
	}
}

const refused = outcomes.filter((outcome) => outcome.problems.length > 0);
if (refused.length > 0) {
	printSummary(
		`Nothing was published: ${refused.length} of ${outcomes.length} book(s) failed their checks. Fix them and deploy again.`,
	);
	process.exit(1);
}

console.log(
	`\n2/2  ${dryRun ? "DRY RUN: wrangler checks each upload and publishes nothing" : "PUBLISH"}`,
);
const message = versionMessage(gitState, uncommitted);
for (const outcome of outcomes) {
	console.log(`\n── ${outcome.book}\n`);
	const deploy = spawnSync(
		wranglerBin,
		["deploy", ...(dryRun ? ["--dry-run"] : []), "--message", message],
		{ cwd: join(appsDir, outcome.book), stdio: "inherit" },
	);
	outcome.published = deploy.status === 0;
}

const failed = outcomes
	.filter((outcome) => !outcome.published)
	.map((outcome) => outcome.book);
const headline = () => {
	if (failed.length === 0) {
		if (!dryRun) {
			return `Published ${outcomes.length} book(s), each version tagged "${message}".`;
		}
		const publish = rehearsingUncommitted
			? `Commit your changes, then publish: bun run bookkit deploy ${selected.join(" ")}`
			: `To publish exactly these builds: bun run bookkit deploy ${selected.join(" ")} --no-build${allowDirty ? " --allow-dirty" : ""}`;
		return `All ${outcomes.length} book(s) passed. ${publish}\n(Publishing needs a Cloudflare login once: bunx wrangler login, or CLOUDFLARE_API_TOKEN in the environment.)`;
	}
	const cause = `wrangler failed for ${failed.join(", ")} (its output is above)`;
	if (dryRun) return `${cause}.`;
	if (failed.length === outcomes.length)
		return `Nothing was published: ${cause}.`;
	return `${cause}; the other books are published. Once the cause is fixed: bun run bookkit deploy ${failed.join(" ")} --no-build`;
};
printSummary(headline());
process.exit(failed.length === 0 ? 0 : 1);
