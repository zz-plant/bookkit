import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultFrames } from "../frames/defaults";
import {
	CONTENT_SECTIONS,
	type ContentFinding,
	type ContentSection,
	checkContentItem,
	mechanismSlugsFrom,
	type RetiredSlug,
	retiredSlugsFromCorpus,
	SECTION_DIRECTORIES,
} from "./content-check";
import { validateFrameSteps } from "./frame";
import { extractFrameConfigFromSource } from "./frame-config";
import type { NormalizedErrorPayload } from "./normalized-error";

/**
 * Validates a whole book's content from disk. `bun run validate`,
 * `bookkit deploy`, the MCP `validate_book` tool, and the validate script that
 * create-bookkit writes all call this, so a book gets the same findings
 * wherever it is checked.
 * Each file goes through `checkContentItem`; the book adds the cross-file
 * context (mechanism slugs, merges recorded in corpus.json) and the frame.
 */

export type BookFinding = Omit<ContentFinding, "code"> & {
	/** Content codes, plus DIRECTORY_MISSING and FRAME_STEP_MISSING. */
	code: string;
	/** Absolute path, when the finding is about one file. */
	file?: string;
};

export type CheckBookOptions = {
	workspaceRoot?: string;
	bookSlug: string;
	/** Release validation (`--no-drafts`): draft examples are errors. */
	releaseMode?: boolean;
	/** Override the frame slug declared in book.config.ts. */
	frameSlug?: string;
};

export type BookCheckResult = {
	ok: boolean;
	book: string;
	findings: BookFinding[];
};

export const bookContentDir = (workspaceRoot: string, book: string): string =>
	join(workspaceRoot, "apps", book, "src", "content", "book");

const listFiles = (dir: string): string[] => {
	if (!existsSync(dir)) return [];
	const files: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) files.push(...listFiles(full));
		else if (entry.isFile() && /\.mdx?$/.test(entry.name)) files.push(full);
	}
	return files;
};

/** Each section's files and their sources. */
export const readBookSources = (
	workspaceRoot: string,
	book: string,
): Record<ContentSection, Array<{ file: string; source: string }>> => {
	const root = bookContentDir(workspaceRoot, book);
	return Object.fromEntries(
		CONTENT_SECTIONS.map((section) => [
			section,
			listFiles(join(root, SECTION_DIRECTORIES[section])).map((file) => ({
				file,
				source: readFileSync(file, "utf8"),
			})),
		]),
	) as Record<ContentSection, Array<{ file: string; source: string }>>;
};

/** Merges recorded in the workspace's corpus.json; empty when it is absent or unreadable. */
export const readRetiredSlugs = (
	workspaceRoot: string,
): Map<string, RetiredSlug> => {
	const path = join(workspaceRoot, "corpus.json");
	if (!existsSync(path)) return new Map();
	try {
		return retiredSlugsFromCorpus(JSON.parse(readFileSync(path, "utf8")));
	} catch {
		// check:corpus reports an unreadable corpus.json.
		return new Map();
	}
};

const frameFinding = (
	workspaceRoot: string,
	book: string,
	frameSlug: string | undefined,
): BookFinding | null => {
	const overview = join(
		bookContentDir(workspaceRoot, book),
		"chapters",
		"00-overview.mdx",
	);
	if (!existsSync(overview)) return null;
	const headings = Array.from(
		readFileSync(overview, "utf8").matchAll(
			/(?:^|\n)#{1,4}\s+([A-Za-z0-9_-]+)/g,
		),
	).map((match) => match[1].toLowerCase());
	const configPath = join(workspaceRoot, "apps", book, "src", "book.config.ts");
	const configured =
		frameSlug ??
		(existsSync(configPath)
			? extractFrameConfigFromSource(readFileSync(configPath, "utf8"))?.slug
			: undefined);
	// Author decisions live in book.config.ts; validate against the configured
	// frame and fall back to the intervention frame when none is declared.
	const frame =
		defaultFrames.find((candidate) => candidate.slug === configured) ??
		defaultFrames.find((candidate) => candidate.slug === "intervention");
	if (!frame) return null;
	const { missingRequiredSteps } = validateFrameSteps(frame, headings);
	if (missingRequiredSteps.length === 0) return null;
	return {
		level: "warning",
		code: "FRAME_STEP_MISSING",
		message: `Framing chapter (00-overview.mdx) for frame "${frame.slug}" is missing required step(s): ${missingRequiredSteps.join(", ")}`,
		fix: `Add a heading for each missing step to chapters/00-overview.mdx (e.g. "## ${missingRequiredSteps[0]}"); the ${frame.slug} frame requires them in that chapter.`,
	};
};

export const checkBookContent = (
	options: CheckBookOptions,
): BookCheckResult => {
	const workspaceRoot = options.workspaceRoot ?? process.cwd();
	const book = options.bookSlug;
	const root = bookContentDir(workspaceRoot, book);
	const findings: BookFinding[] = [];

	for (const section of CONTENT_SECTIONS) {
		const dir = join(root, SECTION_DIRECTORIES[section]);
		if (!existsSync(dir)) {
			findings.push({
				level: "error",
				code: "DIRECTORY_MISSING",
				message: `Missing required directory: ${dir}`,
				fix: `Create ${dir} (it may stay empty), or scaffold the book with bun run bookkit new book.`,
			});
		}
	}

	const sources = readBookSources(workspaceRoot, book);
	const mechanismSlugs = mechanismSlugsFrom(
		sources.mechanism.map(({ source }) => source),
	);
	const retiredSlugs = readRetiredSlugs(workspaceRoot);
	for (const section of CONTENT_SECTIONS) {
		for (const { file, source } of sources[section]) {
			const result = checkContentItem(section, source, {
				mechanismSlugs,
				retiredSlugs,
				releaseMode: options.releaseMode,
				format: file.endsWith(".md") ? "md" : "mdx",
			});
			for (const finding of result.findings)
				findings.push({ ...finding, file });
		}
	}

	const frame = frameFinding(workspaceRoot, book, options.frameSlug);
	if (frame) findings.push(frame);

	return {
		ok: !findings.some((finding) => finding.level === "error"),
		book,
		findings,
	};
};

export type ValidateBookOptions = CheckBookOptions & {
	/** @deprecated Unused; callers decide whether errors fail the run. */
	mode?: "warn" | "error";
	/** @deprecated Use `releaseMode`. */
	noDrafts?: boolean;
};

export type ValidateBookResult = {
	ok: boolean;
	book: string;
	errors: NormalizedErrorPayload[];
	warnings: NormalizedErrorPayload[];
};

const toNormalized = (finding: BookFinding): NormalizedErrorPayload => ({
	machineCode: finding.code,
	humanSummary: finding.message,
	location: { module: "validators/book-validator", file: finding.file },
	failingRule: finding.field
		? `${finding.field} must meet its content contract (bun run bookkit contract)`
		: finding.code,
	nextAction: finding.fix ?? "Fix the finding, then validate again.",
	severity: finding.level,
	gateLevel: finding.level === "error" ? "blocking" : "advisory",
});

/** `checkBookContent` in the NormalizedErrorPayload shape, for generated projects' validate script. */
export function validateBookInMemory(
	options: ValidateBookOptions,
): ValidateBookResult {
	const result = checkBookContent({
		...options,
		releaseMode: options.releaseMode ?? options.noDrafts,
	});
	return {
		ok: result.ok,
		book: result.book,
		errors: result.findings
			.filter((finding) => finding.level === "error")
			.map(toNormalized),
		warnings: result.findings
			.filter((finding) => finding.level === "warning")
			.map(toNormalized),
	};
}
