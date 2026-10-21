import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { extractPageFacts } from "../../packages/astro-bookkit/src/markdown/pageFacts";
import { isThinPage } from "../../packages/astro-bookkit/src/seo/page-meta";
import { parseFrontmatter } from "../../packages/astro-bookkit/src/utils/frontmatter";
import { repoRoot } from "../_lib";
import { loadBookConfigSummary } from "./authoring";

/**
 * Bet B1's test, measured (docs/bets.md): the next three chapters drafted
 * introduce at most one new mechanism between them. Compares the corpus books
 * now with the last commit before the bet started (`bet.since` in
 * corpus.json), using git history only; nothing is recorded by hand.
 */

export type DraftedChapter = {
	book: string;
	file: string;
	title: string;
	words: number;
	mechanisms: string[];
	/** Mechanisms it binds that did not exist when the bet started. */
	newMechanisms: string[];
	/** When the chapter last changed, for ordering. */
	changedAt: string;
};

export type B1Report = {
	bet: string;
	since: string;
	killBy?: string;
	daysLeft?: number;
	baseline: string;
	mechanisms: {
		before: number;
		now: number;
		added: string[];
		retired: string[];
	};
	drafted: DraftedChapter[];
	verdict: "in progress" | "passing" | "failing";
	summary: string;
};

type CorpusBet = { id?: string; since?: string; killBy?: string };

const git = (args: string[]): string | null => {
	const result = spawnSync("git", args, { cwd: repoRoot(), encoding: "utf8" });
	return result.status === 0 ? result.stdout : null;
};

const chaptersDir = (book: string) =>
	join("apps", book, "src", "content", "book", "chapters");
const mechanismsDir = (book: string) =>
	join("apps", book, "src", "content", "book", "mechanisms");

const slugOf = (source: string): string | undefined => {
	const slug = parseFrontmatter(source).data.slug;
	return typeof slug === "string" && slug.trim() ? slug.trim() : undefined;
};

const mechanismSlugsAt = (rev: string, books: string[]): Set<string> => {
	const slugs = new Set<string>();
	for (const book of books) {
		const files = (
			git(["ls-tree", "-r", "--name-only", rev, "--", mechanismsDir(book)]) ??
			""
		)
			.split("\n")
			.filter((file) => /\.mdx?$/.test(file));
		for (const file of files) {
			const slug = slugOf(git(["show", `${rev}:${file}`]) ?? "");
			if (slug) slugs.add(slug);
		}
	}
	return slugs;
};

const mechanismSlugsNow = (books: string[]): Set<string> => {
	const slugs = new Set<string>();
	for (const book of books) {
		const dir = join(repoRoot(), mechanismsDir(book));
		if (!existsSync(dir)) continue;
		for (const file of readdirSync(dir).filter((name) =>
			/\.mdx?$/.test(name),
		)) {
			const slug = slugOf(readFileSync(join(dir, file), "utf8"));
			if (slug) slugs.add(slug);
		}
	}
	return slugs;
};

const listOf = (value: unknown): string[] =>
	Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];

/**
 * Why the bet has no baseline commit. Cloud sessions and CI clone shallow,
 * which cuts history off after the bet started; one fetch restores it (a
 * date-bounded fetch can still stop short of the last commit before `since`).
 */
export const missingBaselineReason = (since: string, shallow: boolean) =>
	shallow
		? `this clone is shallow, so it has no commit before ${since}. Fetch the rest of its history once: git fetch --unshallow origin`
		: `no commit before ${since} in this repository's history`;

export const buildB1Report = async (
	now: Date = new Date(),
): Promise<B1Report | { unavailable: string }> => {
	const corpusPath = join(repoRoot(), "corpus.json");
	if (!existsSync(corpusPath)) return { unavailable: "no corpus.json" };
	const corpus = JSON.parse(readFileSync(corpusPath, "utf8")) as {
		books?: string[];
		bet?: CorpusBet;
	};
	const since = corpus.bet?.since;
	const books = corpus.books ?? [];
	if (!since || books.length === 0) {
		return { unavailable: "corpus.json names no bet.since or books" };
	}
	const baseline = git([
		"rev-list",
		"-1",
		`--before=${since}T00:00:00Z`,
		"HEAD",
	])?.trim();
	if (!baseline) {
		return {
			unavailable: missingBaselineReason(
				since,
				git(["rev-parse", "--is-shallow-repository"])?.trim() === "true",
			),
		};
	}

	const before = mechanismSlugsAt(baseline, books);
	const current = mechanismSlugsNow(books);
	const added = [...current].filter((slug) => !before.has(slug)).sort();
	const retired = [...before].filter((slug) => !current.has(slug)).sort();

	const drafted: DraftedChapter[] = [];
	for (const book of books) {
		const config = await loadBookConfigSummary(book);
		const dir = join(repoRoot(), chaptersDir(book));
		if (!existsSync(dir)) continue;
		for (const name of readdirSync(dir).filter((file) =>
			/\.mdx?$/.test(file),
		)) {
			const path = join(dir, name);
			const rel = relative(repoRoot(), path);
			const source = readFileSync(path, "utf8");
			const words = extractPageFacts(source).wordCount;
			if (isThinPage(words, config.site)) continue;
			const then = git(["show", `${baseline}:${rel}`]);
			if (
				then !== null &&
				!isThinPage(extractPageFacts(then).wordCount, config.site)
			) {
				continue;
			}
			const { data } = parseFrontmatter(source);
			const mechanisms = listOf(data.mechanisms);
			drafted.push({
				book,
				file: rel,
				title: typeof data.title === "string" ? data.title : name,
				words,
				mechanisms,
				newMechanisms: mechanisms.filter((slug) => added.includes(slug)),
				changedAt:
					git(["log", "-1", "--format=%cI", "--", rel])?.trim() ||
					now.toISOString(),
			});
		}
	}
	drafted.sort((a, b) => a.changedAt.localeCompare(b.changedAt));

	const firstThree = drafted.slice(0, 3);
	const introduced = new Set(
		firstThree.flatMap((chapter) => chapter.newMechanisms),
	);
	const verdict =
		firstThree.length < 3
			? "in progress"
			: introduced.size <= 1
				? "passing"
				: "failing";
	const killBy = corpus.bet?.killBy;
	const daysLeft = killBy
		? Math.ceil(
				(Date.parse(`${killBy}T00:00:00Z`) - now.getTime()) / 86_400_000,
			)
		: undefined;
	const summary =
		verdict === "in progress"
			? `${drafted.length} of 3 chapters drafted since ${since}; they introduce ${introduced.size} new mechanism(s) so far (at most 1 allowed).`
			: `The first 3 chapters drafted since ${since} introduce ${introduced.size} new mechanism(s) (at most 1 allowed).`;

	return {
		bet: corpus.bet?.id ?? "B1",
		since,
		killBy,
		daysLeft,
		baseline,
		mechanisms: { before: before.size, now: current.size, added, retired },
		drafted,
		verdict,
		summary,
	};
};
