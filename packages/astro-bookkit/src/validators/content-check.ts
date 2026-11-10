/**
 * What each kind of content file must contain to compile, and a checker that
 * says, field by field, what a file is missing and how to fix it.
 *
 * One definition serves the validator (`bun run validate`), agents (the MCP
 * `get_content_contract` and `check_content` tools), and scaffolds, so the
 * contract an agent reads is the one the compiler enforces. An agent may draft
 * a file; this decides whether it compiles.
 *
 * The parts are in content-check/:
 *
 *   contract.ts       the sections; each record type's fields, nested
 *                     fields, and runbook fields; the finding codes
 *   scaffold.ts       scaffoldSource, and contentContract with its template
 *   unsafe-markup.ts  what UNSAFE_LINK and UNSAFE_HTML findings say
 *   references.ts     slugs and /read links: what a reference may name, the
 *                     fix for one that names nothing, retired slugs
 *   (this file)       checkContentItem, which runs the rules in the order
 *                     findings are reported, and what it says about a
 *                     missing or mistyped field
 */

import { isReleasedStatus } from "../schemas";
import { linesBeforeBody, parseFrontmatter } from "../utils/frontmatter";
import { embedTitle } from "../utils/html-allowlist";
import {
	findUnsafeMarkup,
	findUntitledEmbeds,
	markupEntry,
} from "../utils/markdown";
import {
	type ContentFinding,
	type ContentSection,
	type ContractField,
	FIELDS,
	LABELS,
	misplacedFix,
	NESTED_FIELDS,
	RUNBOOK_TOOL_FIELDS,
	SCHEMAS,
} from "./content-check/contract";
import {
	isValidSlug,
	maskCode,
	READ_LINK,
	READ_SECTIONS,
	type RetiredSlug,
	SECTION_NOUNS,
	suggestedSlug,
	unknownMechanismFix,
	unknownSlugFix,
} from "./content-check/references";
import { templateFor, yamlValue } from "./content-check/scaffold";
import { unsafeMarkupFinding } from "./content-check/unsafe-markup";

export type {
	ContentFinding,
	ContentFindingCode,
	ContentSection,
	ContractField,
} from "./content-check/contract";
export {
	CONTENT_SECTIONS,
	isContentSection,
	SECTION_DIRECTORIES,
} from "./content-check/contract";
export type { RetiredSlug } from "./content-check/references";
export {
	maskCode,
	mechanismSlugsFrom,
	nearest,
	retiredSlugsFromCorpus,
} from "./content-check/references";
export type { ContentContract } from "./content-check/scaffold";
export { contentContract, scaffoldSource } from "./content-check/scaffold";

export type ContentCheckContext = {
	/** Mechanism slugs in the book; references are checked only when given. */
	mechanismSlugs?: ReadonlySet<string>;
	/**
	 * Every slug the book's read routes serve, per section. Prerequisites and
	 * `/read/...` links in the body are checked only when given.
	 */
	slugs?: Partial<Record<ContentSection, ReadonlySet<string>>>;
	/** Slugs merged away (corpus.json `merged`), so a stale reference names its replacement. */
	retiredSlugs?: ReadonlyMap<string, RetiredSlug>;
	/**
	 * Release rules, for a published or stable book: draft records are errors,
	 * and so are broken links and prerequisites in every record.
	 */
	releaseMode?: boolean;
	/** The book's frame; `runbook` requires escalation and runbookSteps on tools. */
	frame?: string;
	/** `mdx` (default) rejects HTML comments, which the MDX compiler cannot parse. */
	format?: "mdx" | "md";
};

/** Body text outside code, where an HTML comment would reach the MDX compiler. */
const proseOutsideCode = (body: string): string =>
	body.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, "").replace(/`[^`\n]*`/g, "");

/** Strings in a frontmatter list; anything else is left to the schema. */
const stringList = (value: unknown): string[] =>
	Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];

export type ContentCheckResult = {
	ok: boolean;
	frontmatter: Record<string, unknown> | null;
	body: string;
	findings: ContentFinding[];
};

const isPresent = (field: ContractField, value: unknown): boolean => {
	if (field.kind === "list")
		return (
			Array.isArray(value) &&
			value.some((item) => typeof item !== "string" || item.trim())
		);
	// Present but mistyped (e.g. "10") is reported by the schema as invalid.
	if (field.kind === "number")
		return value !== undefined && value !== null && value !== "" && value !== 0;
	if (field.kind === "object") return value !== undefined && value !== null;
	return typeof value === "string" && value.trim().length > 0;
};

const exampleText = (field: ContractField): string => {
	if (field.example === undefined) return "";
	return ` For example:${yamlValue(field.example)}`;
};

/**
 * A list field written as text (`prerequisites: start`), which YAML reads as
 * one string: the finding, with the value written as a list.
 */
const notAListFinding = (
	label: string,
	field: ContractField,
	value: string,
	level: "error" | "warning",
): ContentFinding => {
	// "a, b" is two slugs; a sentence with a comma is one item.
	const parts = value
		.split(/\s*,\s*/)
		.map((item) => item.trim())
		.filter(Boolean);
	const items = parts.every(isValidSlug) ? parts : [value];
	return {
		level,
		code: "FIELD_INVALID",
		field: field.name,
		message: `${label} \`${field.name}:\` must be a list, but it is the text "${value}"`,
		fix: `Write each item on its own line (${field.meaning}):\n${field.name}:\n${items.map((item) => `  - ${yamlValue(item).trim()}`).join("\n")}`,
	};
};

/** The fix for a missing field: what to add and what it means. */
const missingFix = (field: ContractField): string =>
	`Add \`${field.name}:\` (${field.meaning})${exampleText(field)}`;

/**
 * Checks one content file's source. Messages match `bun run validate` so the
 * two never disagree; `code`, `field`, and `fix` make them actionable for an
 * agent. Findings never depend on the file's path.
 */
export const checkContentItem = (
	section: ContentSection,
	source: string,
	context: ContentCheckContext = {},
): ContentCheckResult => {
	const label = LABELS[section];
	const findings: ContentFinding[] = [];
	const parsed = parseFrontmatter(source);
	if (parsed.status !== "ok") {
		const template = templateFor(section);
		findings.push(
			parsed.status === "missing"
				? {
						level: "error",
						code: "FRONTMATTER_MISSING",
						message: `${label} missing frontmatter`,
						fix: `Start the file with a YAML block between --- lines, e.g.\n${template}`,
					}
				: {
						level: "error",
						code: "FRONTMATTER_INVALID",
						message: `${label} frontmatter is not valid YAML (${parsed.reason})`,
						fix: "Fix the YAML between the --- lines. Quote strings that contain a colon, and indent list items under their field.",
					},
		);
		return { ok: false, frontmatter: null, body: parsed.body, findings };
	}

	const { data, body } = parsed;
	// A released record is finished: what would only be a gap in a draft is an error.
	const released =
		context.releaseMode === true || isReleasedStatus(data.status);
	const reported = new Set<string>();
	for (const field of FIELDS[section]) {
		if (field.whenMissing === "optional") continue;
		const value =
			section === "tool" && field.name === "name"
				? (data.name ?? data.title)
				: data[field.name];
		if (isPresent(field, value)) continue;
		reported.add(field.name);
		if (field.kind === "list" && typeof value === "string" && value.trim()) {
			findings.push(
				notAListFinding(label, field, value.trim(), field.whenMissing),
			);
			continue;
		}
		findings.push({
			level: field.whenMissing,
			code: "FIELD_MISSING",
			field: field.name,
			message: `${label} missing ${field.name}${field.kind === "list" ? " list" : ""}`,
			fix: missingFix(field),
		});
	}

	const schemaResult = SCHEMAS[section].safeParse(data);
	if (!schemaResult.success) {
		for (const issue of schemaResult.error.issues) {
			const top = String(issue.path[0] ?? "");
			if (reported.has(top)) continue;
			const fieldInfo = FIELDS[section].find((field) => field.name === top);
			if (top === "slug" && section !== "glossary") {
				// The slug is the page's URL and every reference's target.
				const value = String(data.slug);
				const suggestion = suggestedSlug(value);
				findings.push({
					level: "error",
					code: "SLUG_INVALID",
					field: "slug",
					message: `${label} slug "${value}" is not a valid slug (${issue.message})`,
					fix: suggestion
						? `Use lowercase letters, digits, and hyphens: slug: ${suggestion}. Update anything that references the old slug.`
						: "Use lowercase letters, digits, and hyphens.",
				});
				continue;
			}
			if (section === "tool" && top === "timeboxMinutes") {
				findings.push({
					level: "error",
					code: "TIMEBOX_TOO_LONG",
					field: top,
					message: `Action primitive timebox error: ${issue.message}`,
					fix: "Set timeboxMinutes to 10 or less, splitting the tool into smaller tools if it needs more time.",
				});
				continue;
			}
			const listField = FIELDS[section].find(
				(field) => field.name === top && field.kind === "list",
			);
			if (
				listField &&
				issue.path.length === 1 &&
				typeof data[top] === "string" &&
				data[top].trim()
			) {
				findings.push(
					notAListFinding(label, listField, data[top].trim(), "warning"),
				);
				continue;
			}
			findings.push({
				level: "warning",
				code: "FIELD_INVALID",
				field: top || undefined,
				message: `${label} schema issue at ${issue.path.join(".") || "(root)"}: ${issue.message}`,
				fix: fieldInfo
					? `${fieldInfo.name}: ${fieldInfo.meaning}${exampleText(fieldInfo)}`
					: undefined,
			});
		}
	}

	for (const [key, parent] of Object.entries(NESTED_FIELDS[section] ?? {})) {
		if (!(key in data)) continue;
		findings.push({
			level: "error",
			code: "FIELD_MISPLACED",
			field: key,
			message: `${label} has \`${key}:\` at the top level, where the build ignores it`,
			fix: misplacedFix(key, parent),
		});
	}

	if (context.frame === "runbook" && section === "tool") {
		for (const name of RUNBOOK_TOOL_FIELDS) {
			const field = FIELDS.tool.find((candidate) => candidate.name === name);
			if (!field || isPresent(field, data[name])) continue;
			findings.push({
				level: released ? "error" : "warning",
				code: "FIELD_MISSING",
				field: name,
				message: `${label} missing ${name}${field.kind === "list" ? " list" : ""}`,
				fix: `${missingFix(field)} The runbook frame requires it on every tool.`,
			});
		}
	}

	const known = context.mechanismSlugs;
	if (known) {
		const references =
			section === "chapter"
				? (Array.isArray(data.mechanisms) ? data.mechanisms : []).filter(
						(item): item is string => typeof item === "string",
					)
				: section === "tool" || section === "example"
					? typeof data.mechanism === "string" && data.mechanism.trim()
						? [data.mechanism.trim()]
						: []
					: [];
		for (const slug of references) {
			if (known.has(slug)) continue;
			findings.push({
				level: "error",
				code: "UNKNOWN_MECHANISM",
				field: section === "chapter" ? "mechanisms" : "mechanism",
				message: `${label} references unknown mechanism "${slug}"`,
				fix: unknownMechanismFix(slug, known, context.retiredSlugs?.get(slug)),
			});
		}
	}

	const chapterSlugs = context.slugs?.chapter;
	if (section === "chapter" && chapterSlugs) {
		for (const slug of stringList(data.prerequisites)) {
			if (chapterSlugs.has(slug)) continue;
			findings.push({
				level: released ? "error" : "warning",
				code: "UNKNOWN_PREREQUISITE",
				field: "prerequisites",
				message: `${label} lists prerequisite "${slug}", which is not a chapter slug in this book`,
				fix: unknownSlugFix(slug, "chapter", chapterSlugs),
			});
		}
	}

	// Lines are counted in the whole file, so they match the author's editor.
	const bodyStart = source.trimEnd().length - body.length;
	if (context.slugs) {
		for (const match of maskCode(body).matchAll(READ_LINK)) {
			const [, path, sectionPath, rawSlug] = match;
			const target = READ_SECTIONS[sectionPath.toLowerCase()];
			const slugs = target ? context.slugs[target] : undefined;
			if (!target || !slugs) continue;
			let slug = rawSlug.replace(/\/+$/, "");
			try {
				slug = decodeURIComponent(slug);
			} catch {
				// Leave a malformed escape as written; it will not match a slug.
			}
			if (slugs.has(slug)) continue;
			const line = source
				.slice(0, bodyStart + (match.index ?? 0))
				.split("\n").length;
			findings.push({
				level: released ? "error" : "warning",
				code: "BROKEN_LINK",
				message: `${label} links to ${path} on line ${line}, but no ${SECTION_NOUNS[target]} has the slug "${slug}"`,
				fix: unknownSlugFix(slug, target, slugs),
			});
		}
	}

	const bodyLine = linesBeforeBody(source, body);
	const tags = context.format === "md" ? "html" : "jsx";
	for (const found of findUnsafeMarkup(body, { tags })) {
		findings.push({
			level: released ? "error" : "warning",
			...unsafeMarkupFinding(label, markupEntry(found, bodyLine)),
		});
	}
	// Import titles each embed; one written by hand may have none.
	for (const embed of findUntitledEmbeds(body, { tags })) {
		findings.push({
			level: "warning",
			code: "IFRAME_NO_TITLE",
			message: `${label} has an <iframe> with no title on line ${bodyLine + embed.line}, so a screen reader cannot say what it shows, and check:a11y fails its page`,
			fix: `Add a title that says what it shows, as in <iframe title="${embedTitle(embed.src)}" src="…">.`,
		});
	}

	if (
		(context.format ?? "mdx") === "mdx" &&
		proseOutsideCode(body).includes("<!--")
	) {
		findings.push({
			level: "error",
			code: "MDX_HTML_COMMENT",
			message: `${label} uses an HTML comment, which MDX cannot compile`,
			fix: "Replace <!-- … --> with an MDX comment: {/* … */}.",
		});
	}

	if (context.releaseMode && (data.status ?? "draft") === "draft") {
		findings.push({
			level: "error",
			code: "DRAFT_IN_RELEASE",
			field: "status",
			message: `${label} is a draft${data.status === undefined ? " (no status means draft)" : ""}, and a published or stable book may not contain drafts`,
			fix: "Set status: in-review, published, or stable once it is ready, or take it out of the book until it is.",
		});
	}

	return {
		ok: !findings.some((finding) => finding.level === "error"),
		frontmatter: data,
		body,
		findings,
	};
};
