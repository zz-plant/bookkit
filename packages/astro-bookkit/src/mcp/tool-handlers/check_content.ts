import { join } from "node:path";
import { isReleasedStatus } from "../../schemas/status";
import {
	readBookFrame,
	readBookStatus,
	readRetiredSlugs,
	routeSlugsOf,
} from "../../validators/book-validator";
import {
	CONTENT_SECTIONS,
	type ContentFinding,
	type ContentSection,
	checkContentItem,
	mechanismSlugsFrom,
	SECTION_DIRECTORIES,
} from "../../validators/content-check";
import type { CompileFinding } from "../../validators/mdx-compile";
import { runWorkspaceCommand } from "../command-runner";
import type { McpEndpointOptions } from "../types";
import { bookArg, contentOf, toSection } from "./book-arg";
import type { ToolHandler } from "./types";

/** The book's content as the validator reads it: per section, each file with its source. */
const bookSources = (
	options: McpEndpointOptions,
	book: string | undefined,
): Record<ContentSection, Array<{ file: string; source: string }>> => {
	const raw = contentOf(options, book);
	return Object.fromEntries(
		CONTENT_SECTIONS.map((section) => [
			section,
			Object.entries(
				raw[SECTION_DIRECTORIES[section] as keyof typeof raw] ?? {},
			).map(([file, source]) => ({ file, source })),
		]),
	) as Record<ContentSection, Array<{ file: string; source: string }>>;
};

type SimilarMatch = { slug: string; books: string[]; score: number };

/**
 * For a mechanism, existing ones in any book that share its wording (the same
 * lookup as find_similar_mechanisms), leaving out its own slug. Needs the
 * workspace; empty without it.
 */
const similarMechanisms = async (
	options: McpEndpointOptions,
	frontmatter: Record<string, unknown> | null,
): Promise<SimilarMatch[]> => {
	const title = typeof frontmatter?.title === "string" ? frontmatter.title : "";
	if (!title || !options.workspaceRoot) return [];
	const definition =
		typeof frontmatter?.definition === "string" ? frontmatter.definition : "";
	const command = await runWorkspaceCommand(options.workspaceRoot, [
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
 * `bun run bookkit check <file>` runs (references, prerequisites, links, the
 * book's frame and status, and the MDX compiler the build uses), with a field
 * and a fix for each finding. Draft a file, check it here until `ok`, then
 * write it.
 */
export const handleCheckContent: ToolHandler = async ({ options, args }) => {
	const section = toSection(args?.section);
	const source = args?.source;
	if (!section || typeof source !== "string") {
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
	const picked = bookArg(options, args);
	if (!picked.ok) return picked.response;
	const book = picked.book;
	const sources = bookSources(options, book);
	const mechanismSlugs = mechanismSlugsFrom(
		sources.mechanism.map(({ source }) => source),
	);
	// The same rules validate applies: the book's status (unless releaseMode
	// forces release rules) and its frame.
	const bookStatus =
		book && options.workspaceRoot
			? readBookStatus(options.workspaceRoot, book)
			: undefined;
	const frame =
		book && options.workspaceRoot
			? readBookFrame(options.workspaceRoot, book)
			: undefined;
	const releaseRules =
		args?.releaseMode === true || isReleasedStatus(bookStatus);
	const format = args?.format === "md" ? "md" : "mdx";
	const result = checkContentItem(section, source, {
		mechanismSlugs: mechanismSlugs.size > 0 ? mechanismSlugs : undefined,
		slugs: routeSlugsOf(sources),
		retiredSlugs: options.workspaceRoot
			? readRetiredSlugs(options.workspaceRoot)
			: undefined,
		releaseMode: releaseRules,
		frame,
		format,
	});
	// Then the compiler the build uses, unless an HTML comment already
	// explains why it would fail. Only where the book's files are.
	const findings: Array<ContentFinding | CompileFinding> = [...result.findings];
	if (
		format === "mdx" &&
		book &&
		options.workspaceRoot &&
		!findings.some((finding) => finding.code === "MDX_HTML_COMMENT")
	) {
		const { compileFinding, compileMdx } = await import(
			"../../validators/mdx-compile"
		);
		const compiled = compileFinding(
			await compileMdx(source, join(options.workspaceRoot, "apps", book)),
		);
		if (compiled) findings.push(compiled);
	}
	const ok = !findings.some((finding) => finding.level === "error");
	const similar =
		section === "mechanism"
			? await similarMechanisms(options, result.frontmatter)
			: [];
	const errors = findings.filter((f) => f.level === "error").length;
	const warnings = findings.length - errors;
	return {
		ok,
		summary:
			(ok
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
			frame: frame ?? null,
			releaseRules,
			ok,
			findings,
			similar,
			mechanismSlugs: [...mechanismSlugs].sort(),
		},
	};
};
