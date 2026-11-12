/**
 * Validates a whole book from disk. `bun run validate`, `bookkit check`,
 * `bookkit publish`, `bookkit deploy`, the MCP `validate_book` tool, and the
 * validate script that create-bookkit writes all call this, so a book gets the
 * same findings wherever it is checked. A rule a book is held to belongs here,
 * not in one of those callers.
 * Each file goes through `checkContentItem`; the book adds the cross-file
 * context (every section's slugs, merges recorded in corpus.json), the frame,
 * slugs used twice, an action and an example per mechanism, its release
 * notes, its config's starter text and site, and the rules its status sets:
 * a published or stable book is checked with release rules (`releaseMode`).
 *
 * The rules are in book-validator/, one file per family:
 *
 *   sources.ts       shared: BookFinding, each section's files, the config's
 *                    path, status and frame, route slugs, retired slugs
 *   frame-rules.ts   the frame the config declares, and the steps the
 *                    chapters must cover (FRAME_*)
 *   record-rules.ts  images, prerequisite order and cycles, duplicate slugs,
 *                    an action and an example per mechanism, release notes
 *   config-rules.ts  mechanismsIndex.urgency and mechanisms slugs, the
 *                    mechanism count target, starter text, the release site
 *   (this file)      checkBookContent, which runs them in the order findings
 *                    are reported (BOOK_STATUS_INVALID, DIRECTORY_MISSING,
 *                    and BOOK_EMPTY are its own), and validateBookInMemory
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isReleasedStatus, isStatus, STATUSES } from "../schemas/status";
import { parseFrontmatter } from "../utils/frontmatter";
import {
	configFindings,
	configMechanismFindings,
	constraintTargetFindings,
	urgencyFindings,
} from "./book-validator/config-rules";
import { bookFrame, frameFinding } from "./book-validator/frame-rules";
import {
	coverageFindings,
	duplicateSlugFindings,
	missingImageFindings,
	prerequisiteCycleFindings,
	prerequisiteOrderFindings,
	releaseNoteFindings,
} from "./book-validator/record-rules";
import {
	type BookFinding,
	bookCheckContext,
	bookConfigPath,
	bookContentDir,
	type ParsedSource,
	readBookSources,
} from "./book-validator/sources";
import {
	CONTENT_SECTIONS,
	type ContentSection,
	checkContentItem,
	SECTION_DIRECTORIES,
} from "./content-check";
import {
	extractBookStatusFromSource,
	extractFrameConfigFromSource,
} from "./frame-config";
import type { NormalizedErrorPayload } from "./normalized-error";

export type { BookFinding } from "./book-validator/sources";
export {
	type BookSources,
	bookCheckContext,
	bookContentDir,
	candidateCheckContext,
	readBookFrame,
	readBookSources,
	readBookStatus,
	readRetiredSlugs,
	routeSlugsOf,
} from "./book-validator/sources";

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
	const { context } = bookCheckContext({
		sources,
		workspaceRoot,
		book,
		releaseMode,
	});
	const { mechanismSlugs } = context;
	const retiredSlugs = context.retiredSlugs ?? new Map();
	for (const section of CONTENT_SECTIONS) {
		for (const { file, source } of sources[section]) {
			// The frame as validated above, which --frame may override.
			const result = checkContentItem(section, source, {
				...context,
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
	findings.push(...prerequisiteCycleFindings(parsed.chapter));
	findings.push(...prerequisiteOrderFindings(parsed.chapter));
	findings.push(...coverageFindings(book, parsed, releaseMode));
	findings.push(...releaseNoteFindings(root));

	if (configSource) {
		findings.push(
			...urgencyFindings(
				configSource,
				configPath,
				mechanismSlugs,
				retiredSlugs,
				releaseMode,
			),
			...configMechanismFindings(
				configSource,
				configPath,
				mechanismSlugs,
				retiredSlugs,
				releaseMode,
			),
			...constraintTargetFindings(
				configSource,
				configPath,
				mechanismSlugs.size,
			),
			...configFindings(
				workspaceRoot,
				configSource,
				configPath,
				status,
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
