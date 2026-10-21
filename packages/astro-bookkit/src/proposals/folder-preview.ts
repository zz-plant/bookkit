import { defaultFrames } from "../frames/defaults";
import type { FrameDefinition } from "../frames/types";
import { countWords } from "../markdown/pageFacts";
import {
	analyzeMechanismOverlap,
	type ChapterRecord,
	type MechanismRecord,
	type ToolRecord,
} from "../suggestions";
import { didYouMean } from "../utils/did-you-mean";
import { linesBeforeBody, parseFrontmatter } from "../utils/frontmatter";
import {
	createSlugger,
	type MdxConversion,
	markupEntry,
	toMdxBody,
	type UnsafeMarkupEntry,
} from "../utils/markdown";
import { markdownHeadings } from "../utils/markdown-headings";
import {
	type ContentFinding,
	type ContentSection,
	checkContentItem,
	mechanismSlugsFrom,
	SECTION_DIRECTORIES,
} from "../validators/content-check";
import { frameStepsInPage } from "../validators/frame";
import { buildProposalBundle } from "./build-proposal";

/**
 * What Bookkit would make of a folder it does not own: any Markdown, from a
 * wiki export to a runbook repo to a folder that already follows the content
 * contract. Reads only the sources it is given and writes nothing, so it can
 * run on someone's own documents before they adopt anything (`bookkit try`),
 * or gate a folder in CI without converting it to a book (`bookkit check <dir>`).
 *
 * A file is checked against the content contract when it sits in a section
 * folder (mechanisms/, toolkit/, examples/, chapters/, glossary/) or its
 * frontmatter marks it as a mechanism, tool, example, or glossary entry.
 * Anything else is prose, which `bookkit import` would turn into a chapter.
 */

export type FolderSourceFile = { path: string; source: string };

export type FolderFindingCode =
	| ContentFinding["code"]
	| "FRAME_STEP_MISSING"
	| "FRONTMATTER_UNREADABLE";

export type FolderFinding = Omit<ContentFinding, "code"> & {
	code: FolderFindingCode;
};

export type FolderDocument = {
	path: string;
	/** The section the file would be: prose becomes a chapter. */
	section: ContentSection;
	/** Checked against the content contract (true), or prose to import (false). */
	contract: boolean;
	title: string;
	words: number;
	/** Frame steps this document's headings cover, and the required ones they miss. */
	frameSteps: { covered: string[]; missing: string[] };
	/** What import would change for the body to compile as MDX (prose only). */
	mdx?: MdxConversion;
	/**
	 * What import would leave out (prose only): links it keeps as their
	 * text, and raw HTML the allowlist does not keep, as its report lists
	 * them; `line` is in the file. Contract files report them as UNSAFE_LINK
	 * and UNSAFE_HTML.
	 */
	unsafeMarkup?: UnsafeMarkupEntry[];
	findings: FolderFinding[];
};

export type FolderPreviewOptions = {
	/** A frame slug; detected from the prose when left out. */
	frame?: string;
	/** Missing required frame steps become errors (a gate), not just coverage. */
	requireFrameSteps?: boolean;
	/**
	 * Check as a published or stable book would be (`bookkit check <folder>
	 * --release`): a draft record of any section, or one with no status, is an
	 * error, and so is a missing field that a draft may leave empty.
	 */
	releaseMode?: boolean;
	/** How many recurring concepts to propose. */
	maxConcepts?: number;
	/** Name used in proposals; defaults to "folder". */
	name?: string;
};

export type FolderPreview = {
	files: number;
	words: number;
	sections: Record<ContentSection, number>;
	frame: {
		slug: string;
		name: string;
		source: "given" | "detected";
		/** Share of the wording signals that point at this frame (detected only). */
		confidence?: number;
		/** "document": every document must cover the steps; "folder": the folder as a whole. */
		stepsPer: "document" | "folder";
		steps: Array<{
			id: string;
			label: string;
			required: boolean;
			/** Documents whose headings cover this step. */
			documents: number;
		}>;
		/** Required steps no document covers (folder scope only). */
		missing: string[];
	};
	documents: FolderDocument[];
	/** Named ideas that recur across the prose: candidates to register once and bind everywhere. */
	concepts: Array<{
		term: string;
		slug: string;
		occurrences: number;
		files: string[];
	}>;
	/** Pairs of mechanisms in the folder whose contracts read alike. */
	overlaps: Array<{ a: string; b: string; combined: number; message: string }>;
	/** Findings about the folder as a whole rather than one file. */
	findings: FolderFinding[];
	errors: number;
	warnings: number;
};

/** Frames whose steps every loose document must carry: procedures, not arguments. */
const PER_DOCUMENT_FRAMES = new Set(["runbook", "field-guide"]);

const SECTION_FROM_DIRECTORY = new Map(
	(Object.entries(SECTION_DIRECTORIES) as Array<[ContentSection, string]>).map(
		([section, directory]) => [directory, section],
	),
);

const sectionFromPath = (path: string): ContentSection | undefined => {
	for (const part of path.split(/[\\/]/).slice(0, -1).reverse()) {
		const section = SECTION_FROM_DIRECTORY.get(part);
		if (section) return section;
	}
	return undefined;
};

const sectionFromFrontmatter = (
	data: Record<string, unknown>,
): ContentSection | undefined => {
	if (typeof data.term === "string") return "glossary";
	if (
		data.timeboxMinutes !== undefined ||
		(data.trigger !== undefined && data.steps !== undefined)
	) {
		return "tool";
	}
	if (
		typeof data.definition === "string" &&
		(Array.isArray(data.is) || typeof data.slug === "string")
	) {
		return "mechanism";
	}
	if (typeof data.mechanism === "string" && typeof data.domain === "string") {
		return "example";
	}
	return undefined;
};

const text = (value: unknown): string =>
	typeof value === "string" ? value.trim() : "";

const list = (value: unknown): string[] =>
	Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];

const fileTitle = (path: string): string => {
	const base = (path.split(/[\\/]/).pop() ?? path)
		.replace(/\.(md|mdx)$/i, "")
		.replace(/^\d+[\s_-]*/, "")
		.replace(/[-_]+/g, " ")
		.trim();
	return base.charAt(0).toUpperCase() + base.slice(1);
};

const frameFor = (slug: string): FrameDefinition | undefined =>
	defaultFrames.find((frame) => frame.slug === slug);

export const previewFolder = (
	files: FolderSourceFile[],
	options: FolderPreviewOptions = {},
): FolderPreview => {
	if (options.frame && !frameFor(options.frame)) {
		const slugs = defaultFrames.map((frame) => frame.slug);
		throw new Error(
			`Unknown frame "${options.frame}".${didYouMean(options.frame, slugs)} Use one of: ${slugs.join(", ")}.`,
		);
	}
	const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));

	// Parse once; classify each file as contract content or prose.
	const parsed = sorted.map((file) => {
		const frontmatter = parseFrontmatter(file.source);
		const data = frontmatter.status === "ok" ? frontmatter.data : {};
		const byPath = sectionFromPath(file.path);
		const byFrontmatter = sectionFromFrontmatter(data);
		const section = byPath ?? byFrontmatter ?? "chapter";
		return {
			file,
			frontmatter,
			data,
			section,
			contract: Boolean(byPath ?? byFrontmatter),
			body: frontmatter.body,
		};
	});

	const mechanismSources = parsed
		.filter((entry) => entry.section === "mechanism")
		.map((entry) => entry.file.source);
	const mechanismSlugs = mechanismSlugsFrom(mechanismSources);

	const slugger = createSlugger();
	const prose = parsed.filter((entry) => entry.section === "chapter");
	const chapters: ChapterRecord[] = prose.map((entry) => ({
		slug: text(entry.data.slug) || slugger(fileTitle(entry.file.path)),
		title: text(entry.data.title) || fileTitle(entry.file.path),
		mechanisms: list(entry.data.mechanisms),
		prerequisites: list(entry.data.prerequisites),
		file: entry.file.path,
		body: entry.body,
	}));
	const mechanisms: MechanismRecord[] = parsed
		.filter((entry) => entry.section === "mechanism")
		.map((entry) => ({
			slug: text(entry.data.slug),
			title: text(entry.data.title) || text(entry.data.slug),
			definition: text(entry.data.definition),
			is: list(entry.data.is),
			isNot: list(entry.data.isNot),
			predictions: list(entry.data.predictions),
			tests: list(entry.data.tests),
			file: entry.file.path,
		}));
	const tools: ToolRecord[] = parsed
		.filter((entry) => entry.section === "tool")
		.map((entry) => ({
			slug: text(entry.data.slug),
			mechanism: text(entry.data.mechanism),
			name: text(entry.data.name) || text(entry.data.title),
			file: entry.file.path,
		}));
	const glossaryTerms = parsed
		.filter((entry) => entry.section === "glossary")
		.map((entry) => text(entry.data.term))
		.filter(Boolean);

	const bundle = buildProposalBundle({
		book: options.name ?? "folder",
		chapters,
		chapterBodies: prose.map((entry) => ({
			file: entry.file.path,
			body: entry.body,
		})),
		mechanisms,
		tools,
		glossaryTerms,
		existingFrame: options.frame,
		maxMechanismProposals: options.maxConcepts ?? 8,
	});
	const frameSlug = options.frame ?? bundle.frame.frameSlug;
	const frame = frameFor(frameSlug) ?? defaultFrames[0];
	// A folder that is already book content (it has chapters/) keeps its
	// procedures in toolkit entries and frames the book as a whole, as
	// validateBook does; loose documents of a procedural frame each carry it.
	const isBookContent = parsed.some(
		(entry) => entry.contract && entry.section === "chapter",
	);
	const stepsPer =
		PER_DOCUMENT_FRAMES.has(frame.slug) && !isBookContent
			? "document"
			: "folder";
	const required = frame.steps
		.filter((step) => step.required)
		.map((step) => step.id);

	const documents: FolderDocument[] = parsed.map((entry) => {
		const findings: FolderFinding[] = [];
		const covered = frameStepsInPage(frame, entry.body);
		const missing = required.filter((id) => !covered.includes(id));

		if (entry.contract) {
			const result = checkContentItem(entry.section, entry.file.source, {
				mechanismSlugs: mechanismSlugs.size > 0 ? mechanismSlugs : undefined,
				format: /\.md$/i.test(entry.file.path) ? "md" : "mdx",
				releaseMode: options.releaseMode,
			});
			findings.push(...result.findings);
		} else if (entry.frontmatter.status === "invalid") {
			findings.push({
				level: "warning",
				code: "FRONTMATTER_UNREADABLE",
				message: `Frontmatter is not valid YAML (${entry.frontmatter.reason})`,
				fix: "Fix the YAML between the --- lines, or remove the block; import keeps an unreadable block as text.",
			});
		}

		const isProse = entry.section === "chapter";
		if (
			isProse &&
			stepsPer === "document" &&
			options.requireFrameSteps &&
			missing.length > 0
		) {
			const labels = missing.map(
				(id) => frame.steps.find((step) => step.id === id)?.label ?? id,
			);
			findings.push({
				level: "error",
				code: "FRAME_STEP_MISSING",
				message: `Missing ${frame.name.toLowerCase()} section(s): ${labels.join(", ")}`,
				fix: `Add a heading for each, its whole text the section's name (e.g. "## ${labels[0]}"), as a book's chapters need.`,
			});
		}

		// As import converts it: common HTML kept, the rest escaped.
		const converted =
			isProse && !entry.contract
				? toMdxBody(entry.body, { html: "jsx" })
				: undefined;
		const bodyLine = linesBeforeBody(entry.file.source, entry.body);

		return {
			path: entry.file.path,
			section: entry.section,
			contract: entry.contract,
			title:
				text(entry.data.title) ||
				text(entry.data.name) ||
				text(entry.data.term) ||
				markdownHeadings(entry.body)[0]?.text ||
				fileTitle(entry.file.path),
			words: countWords(entry.body),
			frameSteps: { covered, missing },
			mdx: converted?.changes,
			unsafeMarkup: converted?.unsafeMarkup.map((found) =>
				markupEntry(found, bodyLine),
			),
			findings,
		};
	});

	const proseDocuments = documents.filter((doc) => doc.section === "chapter");
	const folderCovered = new Set(
		proseDocuments.flatMap((doc) => doc.frameSteps.covered),
	);
	const folderMissing =
		stepsPer === "folder"
			? required.filter((id) => !folderCovered.has(id))
			: [];
	const findings: FolderFinding[] = [];
	if (
		options.requireFrameSteps &&
		folderMissing.length > 0 &&
		proseDocuments.length > 0
	) {
		findings.push({
			level: "error",
			code: "FRAME_STEP_MISSING",
			message: `No document has a heading for the ${frame.name.toLowerCase()} step(s): ${folderMissing.join(", ")}`,
			fix: `Add a heading for each to the document that frames the whole, e.g. "## ${folderMissing[0]}".`,
		});
	}

	const sections = Object.fromEntries(
		(Object.keys(SECTION_DIRECTORIES) as ContentSection[]).map((section) => [
			section,
			documents.filter((doc) => doc.section === section).length,
		]),
	) as Record<ContentSection, number>;

	const allFindings = [
		...findings,
		...documents.flatMap((doc) => doc.findings),
	];

	return {
		files: documents.length,
		words: documents.reduce((sum, doc) => sum + doc.words, 0),
		sections,
		frame: {
			slug: frame.slug,
			name: frame.name,
			source: options.frame ? "given" : "detected",
			confidence: options.frame
				? undefined
				: Math.round(bundle.frame.confidence * 100) / 100,
			stepsPer,
			steps: frame.steps.map((step) => ({
				id: step.id,
				label: step.label,
				required: step.required,
				documents: proseDocuments.filter((doc) =>
					doc.frameSteps.covered.includes(step.id),
				).length,
			})),
			missing: folderMissing,
		},
		documents,
		concepts: bundle.mechanisms.map((proposal) => ({
			term: proposal.evidence.term,
			slug: proposal.slug,
			occurrences: proposal.evidence.occurrences,
			files: proposal.evidence.files,
		})),
		overlaps: analyzeMechanismOverlap(mechanisms, {
			book: options.name ?? "folder",
		}).map((suggestion) => {
			const [a, b] = suggestion.evidence.pair as [string, string];
			return {
				a,
				b,
				combined: Number(suggestion.evidence.combined),
				message: suggestion.message,
			};
		}),
		findings,
		errors: allFindings.filter((finding) => finding.level === "error").length,
		warnings: allFindings.filter((finding) => finding.level === "warning")
			.length,
	};
};
