import {
	CONTENT_SECTIONS,
	checkContentItem,
	isContentSection,
	mechanismSlugsFrom,
	type RetiredSlug,
	retiredSlugsFromCorpus,
} from "../../validators/content-check";
import type { McpEndpointOptions } from "../types";
import type { ToolHandler } from "./types";

// Loaded like command-runner's child_process: a runtime without node:fs can
// still check content against the served book.
let fs: typeof import("node:fs") | null = null;
try {
	fs = await import("node:fs");
} catch {
	fs = null;
}

/** Mechanism sources for the book being checked: from disk when a workspace book is named, else the served book. */
const mechanismSources = (
	options: McpEndpointOptions,
	book: string | undefined,
): string[] => {
	if (book && book !== options.bookSlug && options.workspaceRoot && fs) {
		const dir = `${options.workspaceRoot}/apps/${book}/src/content/book/mechanisms`;
		const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
		return files
			.filter((file) => /\.mdx?$/.test(file))
			.map((file) =>
				(fs as typeof import("node:fs")).readFileSync(`${dir}/${file}`, "utf8"),
			);
	}
	return Object.values(options.contentRawModules.mechanisms ?? {});
};

/** Merges recorded in the workspace's corpus.json, if it can be read. */
const retiredSlugs = (
	options: McpEndpointOptions,
): Map<string, RetiredSlug> | undefined => {
	const path = `${options.workspaceRoot}/corpus.json`;
	if (!options.workspaceRoot || !fs?.existsSync(path)) return undefined;
	try {
		return retiredSlugsFromCorpus(JSON.parse(fs.readFileSync(path, "utf8")));
	} catch {
		return undefined;
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
	const result = checkContentItem(section, source, {
		mechanismSlugs: mechanismSlugs.size > 0 ? mechanismSlugs : undefined,
		retiredSlugs: retiredSlugs(options),
		releaseMode: args?.releaseMode === true,
	});
	const errors = result.findings.filter((f) => f.level === "error").length;
	const warnings = result.findings.length - errors;
	return {
		ok: result.ok,
		summary: result.ok
			? warnings === 0
				? `Compiles with no findings against ${book ?? "the served book"}.`
				: `Compiles, with ${warnings} warning(s) to fill in.`
			: `Does not compile: ${errors} error(s), ${warnings} warning(s). Apply each fix and check again.`,
		payload: {
			book,
			section,
			ok: result.ok,
			findings: result.findings,
			mechanismSlugs: [...mechanismSlugs].sort(),
		},
	};
};
