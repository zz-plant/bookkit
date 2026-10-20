import { isReleasedStatus } from "../../schemas/status";
import {
	readBookSources,
	readBookStatus,
	readRetiredSlugs,
} from "../../validators/book-validator";
import {
	CONTENT_SECTIONS,
	checkContentItem,
	isContentSection,
	mechanismSlugsFrom,
} from "../../validators/content-check";
import { runWorkspaceCommand } from "../command-runner";
import type { McpEndpointOptions } from "../types";
import type { ToolHandler } from "./types";

/** Mechanism sources for the book being checked: from disk when a workspace book is named, else the served book. */
const mechanismSources = (
	options: McpEndpointOptions,
	book: string | undefined,
): string[] =>
	book && book !== options.bookSlug && options.workspaceRoot
		? readBookSources(options.workspaceRoot, book).mechanism.map(
				({ source }) => source,
			)
		: Object.values(options.contentRawModules.mechanisms ?? {});

type SimilarMatch = { slug: string; books: string[]; score: number };

/**
 * For a mechanism, existing ones in any book that share its wording (the same
 * lookup as find_similar_mechanisms), leaving out its own slug. Needs the
 * workspace; empty without it.
 */
const similarMechanisms = (
	options: McpEndpointOptions,
	frontmatter: Record<string, unknown> | null,
): SimilarMatch[] => {
	const title = typeof frontmatter?.title === "string" ? frontmatter.title : "";
	if (!title || !options.workspaceRoot) return [];
	const definition =
		typeof frontmatter?.definition === "string" ? frontmatter.definition : "";
	const command = runWorkspaceCommand(options.workspaceRoot, [
		"run",
		"scripts/bookkit.ts",
		"similar",
		title,
		...(definition ? ["--definition", definition] : []),
		"--json",
	]);
	try {
		const parsed = JSON.parse(command.stdout) as { similar?: SimilarMatch[] };
		return (parsed.similar ?? []).filter(
			(match) => match.slug !== frontmatter?.slug && match.score >= 0.3,
		);
	} catch {
		return [];
	}
};

/**
 * Compiles one candidate file without writing it: the same checks
 * `bun run validate` runs, with a field and a fix for each finding. Draft a
 * file, check it here until `ok`, then write it.
 */
export const handleCheckContent: ToolHandler = ({ options, args }) => {
	const section = args?.section;
	const source = args?.source;
	if (!isContentSection(section) || typeof source !== "string") {
		return {
			ok: false,
			summary: `Pass section (${CONTENT_SECTIONS.join(", ")}) and source (the full file text, frontmatter included).`,
			error: {
				cause: "invalid arguments",
				machineCode: "CHECK_CONTENT_ARGUMENTS",
				nextAction:
					"Call again with section and source; bookkit.get_content_contract shows a valid file.",
			},
		};
	}
	const book =
		typeof args?.book === "string" && args.book.trim()
			? args.book.trim()
			: options.bookSlug;
	const mechanismSlugs = mechanismSlugsFrom(mechanismSources(options, book));
	// The same rule validate applies: the book's status, unless releaseMode forces release rules.
	const bookStatus =
		book && options.workspaceRoot
			? readBookStatus(options.workspaceRoot, book)
			: undefined;
	const releaseRules =
		args?.releaseMode === true || isReleasedStatus(bookStatus);
	const result = checkContentItem(section, source, {
		mechanismSlugs: mechanismSlugs.size > 0 ? mechanismSlugs : undefined,
		retiredSlugs: options.workspaceRoot
			? readRetiredSlugs(options.workspaceRoot)
			: undefined,
		releaseMode: releaseRules,
	});
	const similar =
		section === "mechanism"
			? similarMechanisms(options, result.frontmatter)
			: [];
	const errors = result.findings.filter((f) => f.level === "error").length;
	const warnings = result.findings.length - errors;
	return {
		ok: result.ok,
		summary:
			(result.ok
				? warnings === 0
					? `Compiles with no findings against ${book ?? "the served book"}.`
					: `Compiles, with ${warnings} warning(s) to fill in.`
				: `Does not compile: ${errors} error(s), ${warnings} warning(s). Apply each fix and check again.`) +
			(similar.length > 0
				? ` May duplicate ${similar.map((match) => match.slug).join(", ")}: bind that slug if it is the same idea.`
				: ""),
		payload: {
			book,
			section,
			bookStatus: bookStatus ?? null,
			releaseRules,
			ok: result.ok,
			findings: result.findings,
			similar,
			mechanismSlugs: [...mechanismSlugs].sort(),
		},
	};
};
