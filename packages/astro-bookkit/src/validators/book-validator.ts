import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { defaultFrames } from "../frames/defaults";
import { isReleasedStatus, isStatus, STATUSES } from "../schemas/status";
import { parseFrontmatter } from "../utils/frontmatter";
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
import {
	extractBookStatusFromSource,
	extractFrameConfigFromSource,
} from "./frame-config";
import type { NormalizedErrorPayload } from "./normalized-error";

/**
 * Validates a whole book's content from disk. `bun run validate`,
 * `bookkit deploy`, the MCP `validate_book` tool, and the validate script that
 * create-bookkit writes all call this, so a book gets the same findings
 * wherever it is checked.
 * Each file goes through `checkContentItem`; the book adds the cross-file
 * context (every section's slugs, merges recorded in corpus.json), the frame,
 * slugs used twice, and the rules its status sets: a published or stable
 * book is checked with release rules (`releaseMode`).
 */

export type BookFinding = Omit<ContentFinding, "code"> & {
	/**
	 * Content codes, plus DIRECTORY_MISSING, FRAME_STEP_MISSING, DUPLICATE_SLUG,
	 * BOOK_STATUS_INVALID, and BOOK_EMPTY.
	 */
	code: string;
	/** Absolute path, when the finding is about one file. */
	file?: string;
};

export type CheckBookOptions = {
	workspaceRoot?: string;
	bookSlug: string;
	/**
	 * Apply release rules whatever the book's status. Otherwise a published or
	 * stable book gets them and any other book does not.
	 */
	releaseMode?: boolean;
	/** Override the frame slug declared in book.config.ts. */
	frameSlug?: string;
};

export type BookCheckResult = {
	ok: boolean;
	book: string;
	/** `status` in book.config.ts; undefined when it sets none (a draft). */
	status?: string;
	/** Whether release rules applied. */
	releaseMode: boolean;
	findings: BookFinding[];
};

export const bookContentDir = (workspaceRoot: string, book: string): string =>
	join(workspaceRoot, "apps", book, "src", "content", "book");

/**
 * Content files under a folder, in path order: the order the build's
 * import.meta.glob index sorts them, so the first of two files sharing a slug
 * is the one the site serves.
 */
const listFiles = (dir: string): string[] => {
	if (!existsSync(dir)) return [];
	const files: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) files.push(...listFiles(full));
		else if (entry.isFile() && /\.mdx?$/.test(entry.name)) files.push(full);
	}
	return files.sort((a, b) => a.localeCompare(b));
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
const bookConfigPath = (workspaceRoot: string, book: string) =>
	join(workspaceRoot, "apps", book, "src", "book.config.ts");

/** The `status` written in apps/<book>/src/book.config.ts, if any. */
export const readBookStatus = (
	workspaceRoot: string,
	book: string,
): string | undefined => {
	const path = bookConfigPath(workspaceRoot, book);
	return existsSync(path)
		? extractBookStatusFromSource(readFileSync(path, "utf8"))
		: undefined;
};

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
	configured: string | undefined,
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

/** The slug a record's page is served at: its `slug`, else its file name. */
const routeSlug = (file: string, data: Record<string, unknown>): string =>
	typeof data.slug === "string" || typeof data.slug === "number"
		? String(data.slug)
		: basename(file).replace(/\.mdx?$/, "");

type ParsedSource = {
	file: string;
	source: string;
	data: Record<string, unknown> | null;
};

/**
 * Two records of a section served at the same slug (in the same locale): the
 * site builds one page for it and drops the other, while the PDF and EPUB
 * include every chapter.
 */
const duplicateSlugFindings = (
	root: string,
	section: ContentSection,
	parsed: ParsedSource[],
): BookFinding[] => {
	const first = new Map<string, string>();
	const findings: BookFinding[] = [];
	for (const { file, data } of parsed) {
		if (!data) continue;
		const slug = routeSlug(file, data);
		const locale = typeof data.locale === "string" ? data.locale : "";
		const key = `${slug}\u0000${locale.toLowerCase()}`;
		const earlier = first.get(key);
		if (!earlier) {
			first.set(key, file);
			continue;
		}
		findings.push({
			level: "error",
			code: "DUPLICATE_SLUG",
			field: "slug",
			file,
			message: `${section === "glossary" ? "Glossary entry" : `${section[0].toUpperCase()}${section.slice(1)}`} slug "${slug}" is also used by ${relative(root, earlier)}; the site serves one page per slug, so one of them would not be published${section === "chapter" ? " (the PDF and EPUB would include both)" : ""}`,
			fix: "Give each its own slug (and update anything that links to the one you rename), or delete the duplicate.",
		});
	}
	return findings;
};

export const checkBookContent = (
	options: CheckBookOptions,
): BookCheckResult => {
	const workspaceRoot = options.workspaceRoot ?? process.cwd();
	const book = options.bookSlug;
	const root = bookContentDir(workspaceRoot, book);
	const findings: BookFinding[] = [];

	const configPath = bookConfigPath(workspaceRoot, book);
	const configSource = existsSync(configPath)
		? readFileSync(configPath, "utf8")
		: undefined;
	const status = configSource
		? extractBookStatusFromSource(configSource)
		: undefined;
	if (status !== undefined && !isStatus(status)) {
		findings.push({
			level: "error",
			code: "BOOK_STATUS_INVALID",
			field: "status",
			file: configPath,
			message: `Book status "${status}" is not one of ${STATUSES.join(", ")}`,
			fix: 'Set status in book.config.ts to "draft" while writing, "in-review" while it is read by reviewers, and "published" (or "stable") once it is released.',
		});
	}
	const releaseMode = options.releaseMode === true || isReleasedStatus(status);
	const frameSlug =
		options.frameSlug ??
		(configSource
			? extractFrameConfigFromSource(configSource)?.slug
			: undefined);

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
	const parsed = Object.fromEntries(
		CONTENT_SECTIONS.map((section) => [
			section,
			sources[section].map(({ file, source }) => {
				const frontmatter = parseFrontmatter(source);
				return {
					file,
					source,
					data: frontmatter.status === "ok" ? frontmatter.data : null,
				};
			}),
		]),
	) as Record<ContentSection, ParsedSource[]>;
	const slugs = Object.fromEntries(
		CONTENT_SECTIONS.map((section) => [
			section,
			new Set(
				parsed[section].flatMap(({ file, data }) =>
					data ? [routeSlug(file, data)] : [],
				),
			),
		]),
	) as Record<ContentSection, Set<string>>;
	const mechanismSlugs = mechanismSlugsFrom(
		sources.mechanism.map(({ source }) => source),
	);
	const retiredSlugs = readRetiredSlugs(workspaceRoot);
	for (const section of CONTENT_SECTIONS) {
		for (const { file, source } of sources[section]) {
			const result = checkContentItem(section, source, {
				mechanismSlugs,
				slugs,
				retiredSlugs,
				releaseMode,
				frame: frameSlug,
				format: file.endsWith(".md") ? "md" : "mdx",
			});
			for (const finding of result.findings)
				findings.push({ ...finding, file });
		}
		findings.push(...duplicateSlugFindings(root, section, parsed[section]));
	}

	// Only a draft may be empty: anything further along is meant to be read.
	if ((status ?? "draft") !== "draft" && sources.chapter.length === 0) {
		findings.push({
			level: "error",
			code: "BOOK_EMPTY",
			message: `The book is ${status} but has no chapters, so it would publish an empty site`,
			fix: `Add a chapter (bun run bookkit new chapter ${book} "<title>"), or set status: "draft" in book.config.ts until it has one.`,
		});
	}

	const frame = frameFinding(workspaceRoot, book, frameSlug);
	if (frame) findings.push(frame);

	return {
		ok: !findings.some((finding) => finding.level === "error"),
		book,
		status,
		releaseMode,
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
