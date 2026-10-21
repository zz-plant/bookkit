import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { defaultFrames } from "../frames/defaults";
import type { FrameDefinition } from "../frames/types";
import { isReleasedStatus, isStatus, STATUSES } from "../schemas/status";
import { didYouMean } from "../utils/did-you-mean";
import { parseFrontmatter } from "../utils/frontmatter";
import {
	CONTENT_SECTIONS,
	type ContentFinding,
	type ContentSection,
	checkContentItem,
	maskCode,
	mechanismSlugsFrom,
	nearest,
	type RetiredSlug,
	retiredSlugsFromCorpus,
	SECTION_DIRECTORIES,
} from "./content-check";
import { frameStepsInPage } from "./frame";
import {
	extractBookStatusFromSource,
	extractFrameConfigFromSource,
	extractMechanismUrgencySlugsFromSource,
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
	 * Content codes, plus DIRECTORY_MISSING, FRAME_STEP_MISSING, FRAME_UNKNOWN,
	 * FRAME_STEP_UNKNOWN, FRAME_STEP_REQUIRED, DUPLICATE_SLUG,
	 * BOOK_STATUS_INVALID, BOOK_EMPTY, and IMAGE_MISSING.
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

/** The frame slug set in apps/<book>/src/book.config.ts, if any. */
export const readBookFrame = (
	workspaceRoot: string,
	book: string,
): string | undefined => {
	const path = bookConfigPath(workspaceRoot, book);
	return existsSync(path)
		? extractFrameConfigFromSource(readFileSync(path, "utf8"))?.slug
		: undefined;
};

/** Every slug the book's read routes serve, per section. */
export const routeSlugsOf = (
	sources: Record<ContentSection, Array<{ file: string; source: string }>>,
): Record<ContentSection, Set<string>> =>
	Object.fromEntries(
		CONTENT_SECTIONS.map((section) => [
			section,
			new Set(
				sources[section].flatMap(({ file, source }) => {
					const frontmatter = parseFrontmatter(source);
					return frontmatter.status === "ok"
						? [routeSlug(file, frontmatter.data)]
						: [];
				}),
			),
		]),
	) as Record<ContentSection, Set<string>>;

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

/** The frame a book follows, and the steps its framing chapter must carry. */
type BookFrame = { frame: FrameDefinition; steps: string[] };

const FRAME_SLUGS = defaultFrames.map((frame) => frame.slug);

/**
 * The frame book.config.ts declares (`slug`, or `override` from the caller)
 * and the steps the book's framing chapter must carry: `frame.steps`, which
 * may add a frame's optional steps but not leave out a required one. Without
 * a `frame`, a book follows the intervention frame. A slug no frame has, a
 * step its frame does not have, and a required step left out are errors in
 * book.config.ts; with an unknown slug the chapters are not checked against
 * any frame.
 */
const bookFrame = (
	declared: { slug: string; steps?: string[] } | null,
	override: string | undefined,
	configPath: string,
): { frame?: BookFrame; findings: BookFinding[] } => {
	const slug = override ?? declared?.slug ?? "intervention";
	const frame = defaultFrames.find((candidate) => candidate.slug === slug);
	if (!frame) {
		return {
			findings: [
				{
					level: "error",
					code: "FRAME_UNKNOWN",
					field: "frame.slug",
					file: override ? undefined : configPath,
					message: `Frame "${slug}" is not one of Bookkit's frames, so the chapters were not checked against one.${didYouMean(slug, FRAME_SLUGS)}`,
					fix: `${override ? "Use" : "Set frame.slug in book.config.ts to"} one of: ${FRAME_SLUGS.join(", ")}.`,
				},
			],
		};
	}
	const ids = frame.steps.map((step) => step.id);
	const required = frame.steps
		.filter((step) => step.required)
		.map((step) => step.id);
	// An override names another frame; the config's steps belong to its own.
	const listed = override === undefined ? declared?.steps : undefined;
	if (!listed) return { frame: { frame, steps: required }, findings: [] };
	const findings: BookFinding[] = [];
	for (const id of listed.filter((step) => !ids.includes(step))) {
		findings.push({
			level: "error",
			code: "FRAME_STEP_UNKNOWN",
			field: "frame.steps",
			file: configPath,
			message: `frame.steps names "${id}", which is not a step of the ${frame.slug} frame.${didYouMean(id, ids)}`,
			fix: `List the ${frame.slug} frame's steps in frame.steps: ${ids.join(", ")}.`,
		});
	}
	for (const id of required.filter((step) => !listed.includes(step))) {
		findings.push({
			level: "error",
			code: "FRAME_STEP_REQUIRED",
			field: "frame.steps",
			file: configPath,
			message: `frame.steps leaves out "${id}", which the ${frame.slug} frame requires`,
			fix: `Add "${id}" to frame.steps in book.config.ts. A book can add a frame's optional steps but cannot drop a required one.`,
		});
	}
	return {
		frame: {
			frame,
			steps: ids.filter((id) => required.includes(id) || listed.includes(id)),
		},
		findings,
	};
};

/**
 * The frame steps the book does not cover: in its framing chapter
 * (00-overview.mdx) when it has one, else in its chapters taken together (an
 * imported book has no overview). A step is covered by a heading whose whole
 * text slugs to it (`frameStepsInPage`).
 */
const frameFinding = (
	workspaceRoot: string,
	book: string,
	{ frame, steps }: BookFrame,
	chapters: readonly ParsedSource[],
): BookFinding | null => {
	const overview = join(
		bookContentDir(workspaceRoot, book),
		"chapters",
		"00-overview.mdx",
	);
	const hasOverview = existsSync(overview);
	if (!hasOverview && chapters.length === 0) return null;
	const sources = hasOverview
		? [readFileSync(overview, "utf8")]
		: chapters.map((chapter) => chapter.source);
	const present = new Set(
		sources.flatMap((source) =>
			frameStepsInPage(frame, parseFrontmatter(source).body),
		),
	);
	const missingSteps = steps.filter((id) => !present.has(id));
	if (missingSteps.length === 0) return null;
	const example =
		frame.steps.find((step) => step.id === missingSteps[0])?.label ??
		missingSteps[0];
	return hasOverview
		? {
				level: "warning",
				code: "FRAME_STEP_MISSING",
				message: `Framing chapter (00-overview.mdx) for frame "${frame.slug}" is missing required step(s): ${missingSteps.join(", ")}`,
				fix: `Add a heading for each missing step to chapters/00-overview.mdx, its whole text the step's name (e.g. "## ${example}"); the ${frame.slug} frame requires them in that chapter.`,
			}
		: {
				level: "warning",
				code: "FRAME_STEP_MISSING",
				message: `No chapter covers the "${frame.slug}" frame's step(s): ${missingSteps.join(", ")}`,
				fix: `Give the chapter that covers each a heading whose whole text is the step's name (e.g. "## ${example}"), or add a chapters/00-overview.mdx that walks through every step. If the book is another kind, set frame in book.config.ts.`,
			};
};

// `![alt](src)` and `<img src="…">`: the images a record shows.
const IMAGE_SOURCES =
	/!\[[^\]\n]*\]\(\s*<?([^\s)>]+)|<img\b[^>]*?\ssrc\s*=\s*["']?([^"'\s>]+)/gi;

/**
 * Images a record shows that are not in the book: a path under the book's
 * `public/` folder (`/images/x.png`), or one relative to the record, that
 * names no file. The site shows a broken image and the PDF its alt text.
 * Addresses on the web are not checked.
 */
const missingImageFindings = (
	workspaceRoot: string,
	book: string,
	file: string,
	source: string,
	releaseMode: boolean,
): BookFinding[] => {
	const publicDir = join(workspaceRoot, "apps", book, "public");
	const masked = maskCode(source);
	const findings: BookFinding[] = [];
	for (const match of masked.matchAll(IMAGE_SOURCES)) {
		const src = (match[1] ?? match[2] ?? "").trim();
		if (!src || /^([a-z][a-z0-9+.-]*:|\/\/|#|\{)/i.test(src)) continue;
		let path = src.split(/[?#]/)[0];
		try {
			path = decodeURIComponent(path);
		} catch {
			// Keep the path as written.
		}
		const target = path.startsWith("/")
			? join(publicDir, path)
			: join(dirname(file), path);
		if (existsSync(target)) continue;
		const line = source.slice(0, match.index ?? 0).split("\n").length;
		findings.push({
			level: releaseMode ? "error" : "warning",
			code: "IMAGE_MISSING",
			file,
			message: `Shows the image ${src} on line ${line}, but there is no file at ${relative(workspaceRoot, target)}`,
			fix: path.startsWith("/")
				? `Put the image at ${relative(workspaceRoot, target)} (a path that starts with / is read from the book's public/ folder), or fix the path.`
				: "A relative path is read from the record's own folder; fix the path, or put the image under the book's public/ folder and write /images/<name>.",
		});
	}
	return findings;
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
 * Chapters that list a prerequisite readers reach only later. Readers meet
 * chapters in reading order (an explicit `order`, else file order, as the
 * read pages and exports list them), so the prerequisite graph and that
 * order must agree.
 */
const prerequisiteOrderFindings = (
	chapters: readonly ParsedSource[],
): BookFinding[] => {
	const orderOf = (data: Record<string, unknown> | null) =>
		typeof data?.order === "number" ? data.order : Number.POSITIVE_INFINITY;
	const reading = chapters
		.filter((chapter) => chapter.data)
		.map((chapter, index) => ({ chapter, index }))
		.sort(
			(a, b) =>
				orderOf(a.chapter.data) - orderOf(b.chapter.data) ||
				(a.chapter.file < b.chapter.file ? -1 : 1),
		)
		.map(({ chapter }) => chapter);
	const position = new Map(
		reading.map((chapter, index) => [
			routeSlug(chapter.file, chapter.data ?? {}),
			index,
		]),
	);
	return reading.flatMap((chapter, index) => {
		const slug = routeSlug(chapter.file, chapter.data ?? {});
		const prerequisites = Array.isArray(chapter.data?.prerequisites)
			? chapter.data.prerequisites.filter(
					(item): item is string => typeof item === "string",
				)
			: [];
		return prerequisites
			.filter((prerequisite) => (position.get(prerequisite) ?? -1) > index)
			.map((prerequisite) => ({
				level: "warning" as const,
				code: "PREREQUISITE_ORDER",
				field: "prerequisites",
				file: chapter.file,
				message: `Chapter "${slug}" lists prerequisite "${prerequisite}", which readers reach only after it`,
				fix: `Move "${prerequisite}" before "${slug}" (by file name, or with \`order:\`), or remove the prerequisite.`,
			}));
	});
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

/**
 * Slugs in `mechanismsIndex.urgency` that name no mechanism of the book. The
 * index would ignore them, so a typo or a merged mechanism silently loses its
 * place: an error once release rules apply, a warning before.
 */
const urgencyFindings = (
	configSource: string,
	configPath: string,
	mechanismSlugs: ReadonlySet<string>,
	retiredSlugs: ReadonlyMap<string, RetiredSlug>,
	releaseMode: boolean,
): BookFinding[] =>
	extractMechanismUrgencySlugsFromSource(configSource)
		.filter((slug) => !mechanismSlugs.has(slug))
		.map((slug) => {
			const retired = retiredSlugs.get(slug);
			const close = nearest(slug, [...mechanismSlugs]);
			return {
				level: releaseMode ? "error" : "warning",
				code: "UNKNOWN_MECHANISM",
				field: "mechanismsIndex.urgency",
				file: configPath,
				message: `mechanismsIndex.urgency names "${slug}", which is not a mechanism in this book, so the mechanisms index ignores it`,
				fix:
					retired && mechanismSlugs.has(retired.into)
						? `${slug} was merged into ${retired.into}${retired.date ? ` on ${retired.date}` : ""}: rename the key to "${retired.into}", or remove it.`
						: close.length > 0
							? `Did you mean ${close.map((candidate) => `"${candidate}"`).join(" or ")}? Rename the key to that mechanism's slug, or remove it.`
							: `Use the slug of one of this book's mechanisms (src/content/book/mechanisms/), or remove the key.`,
			};
		});

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
	const configuredFrame = bookFrame(
		configSource ? extractFrameConfigFromSource(configSource) : null,
		options.frameSlug,
		configPath,
	);
	findings.push(...configuredFrame.findings);
	const frameSlug = configuredFrame.frame?.frame.slug;

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
	const slugs = routeSlugsOf(sources);
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
			findings.push(
				...missingImageFindings(workspaceRoot, book, file, source, releaseMode),
			);
		}
		findings.push(...duplicateSlugFindings(root, section, parsed[section]));
	}
	findings.push(...prerequisiteOrderFindings(parsed.chapter));

	if (configSource) {
		findings.push(
			...urgencyFindings(
				configSource,
				configPath,
				mechanismSlugs,
				retiredSlugs,
				releaseMode,
			),
		);
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

	const frame =
		configuredFrame.frame &&
		frameFinding(workspaceRoot, book, configuredFrame.frame, parsed.chapter);
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
