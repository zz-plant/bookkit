import { type ZodType, z } from "zod";
import {
	chapterSchema,
	exampleSchema,
	glossarySchema,
	isReleasedStatus,
	mechanismSchema,
	toolkitSchema,
} from "../schemas";
import { SLUG_PATTERN } from "../schemas/slug";
import { linesBeforeBody, parseFrontmatter } from "../utils/frontmatter";
import {
	elementReason,
	embedTitle,
	extraPermissions,
	refusalReason,
} from "../utils/html-allowlist";
import { SAFE_SCHEME_LIST } from "../utils/links";
import {
	findUnsafeMarkup,
	findUntitledEmbeds,
	markupEntry,
	type UnsafeMarkupEntry,
} from "../utils/markdown";

/**
 * What each kind of content file must contain to compile, and a checker that
 * says, field by field, what a file is missing and how to fix it.
 *
 * One definition serves the validator (`bun run validate`), agents (the MCP
 * `get_content_contract` and `check_content` tools), and scaffolds, so the
 * contract an agent reads is the one the compiler enforces. An agent may draft
 * a file; this decides whether it compiles.
 */

export const CONTENT_SECTIONS = [
	"mechanism",
	"tool",
	"example",
	"chapter",
	"glossary",
] as const;

export type ContentSection = (typeof CONTENT_SECTIONS)[number];

export const isContentSection = (value: unknown): value is ContentSection =>
	typeof value === "string" &&
	(CONTENT_SECTIONS as readonly string[]).includes(value);

/** The folder under `src/content/book/` that holds each section. */
export const SECTION_DIRECTORIES: Record<ContentSection, string> = {
	mechanism: "mechanisms",
	tool: "toolkit",
	example: "examples",
	chapter: "chapters",
	glossary: "glossary",
};

const LABELS: Record<ContentSection, string> = {
	mechanism: "Mechanism",
	tool: "Tool",
	example: "Example",
	chapter: "Chapter",
	glossary: "Glossary",
};

const SCHEMAS: Record<ContentSection, ZodType> = {
	mechanism: mechanismSchema,
	tool: toolkitSchema,
	example: exampleSchema,
	chapter: chapterSchema,
	glossary: glossarySchema,
};

export type ContractField = {
	name: string;
	/**
	 * What the compiler reports when the field is absent or empty: `error`
	 * fails `validate --mode error`, `warning` is reported, `optional` is not.
	 */
	whenMissing: "error" | "warning" | "optional";
	kind: "slug" | "string" | "number" | "list" | "object";
	/** What to write, for the author or agent filling it in. */
	meaning: string;
	example?: string | number | readonly string[];
};

const STATUS_FIELD: ContractField = {
	name: "status",
	whenMissing: "optional",
	kind: "string",
	meaning:
		"draft (the default when absent), in-review, published, or stable. A published or stable book may not contain drafts, and a published or stable record's broken links and prerequisites are errors rather than warnings.",
	example: "draft",
};

/**
 * Example values illustrate the format only; they are not content from any
 * book, and a file should never keep them.
 */
const FIELDS: Record<ContentSection, readonly ContractField[]> = {
	mechanism: [
		{
			name: "slug",
			whenMissing: "error",
			kind: "slug",
			meaning:
				"Durable identifier: lowercase words joined by hyphens. Chapters, tools, and examples bind to it; renaming or redefining it is a breaking change.",
			example: "promise-drift",
		},
		{
			name: "title",
			whenMissing: "error",
			kind: "string",
			meaning: "The mechanism's name as readers see it.",
			example: "Promise drift",
		},
		{
			name: "definition",
			whenMissing: "warning",
			kind: "string",
			meaning:
				"One or two sentences naming the lever: what the system does, and who bears the cost.",
			example:
				"Deadlines an institution sets for itself slide without consequence, while the person waiting absorbs the cost of each slip.",
		},
		{
			name: "is",
			whenMissing: "warning",
			kind: "list",
			meaning: "Observable patterns that count as this mechanism.",
			example: ["Promised dates move without notice or reason."],
		},
		{
			name: "isNot",
			whenMissing: "warning",
			kind: "list",
			meaning:
				"Nearby things it is not, so the boundary can be tested instead of argued.",
			example: ["A one-off delay that is explained and compensated."],
		},
		{
			name: "predictions",
			whenMissing: "warning",
			kind: "list",
			meaning: "What you would expect to observe where it is active.",
			example: [
				"Promised dates slip more often for people who cannot escalate.",
			],
		},
		{
			name: "tests",
			whenMissing: "warning",
			kind: "list",
			meaning: "Checks a reader can run to tell whether it is active.",
			example: [
				"Compare the first promised date with the date the decision arrived.",
			],
		},
		STATUS_FIELD,
		{
			name: "satisfies",
			whenMissing: "optional",
			kind: "list",
			meaning: "Control IDs this mechanism satisfies (runbook audit mapping).",
		},
	],
	tool: [
		{
			name: "slug",
			whenMissing: "error",
			kind: "slug",
			meaning: "Durable identifier: lowercase words joined by hyphens.",
			example: "promise-drift--date-check",
		},
		{
			name: "mechanism",
			whenMissing: "error",
			kind: "slug",
			meaning:
				"Slug of the mechanism this tool counters. It must exist in the book.",
			example: "promise-drift",
		},
		{
			name: "name",
			whenMissing: "error",
			kind: "string",
			meaning: "The tool's name as readers see it (`title` also works).",
			example: "Date check",
		},
		{
			name: "trigger",
			whenMissing: "warning",
			kind: "string",
			meaning:
				"The situation that tells the reader to use it, in one sentence.",
			example: "A request has been pending past the date you were promised.",
		},
		{
			name: "timeboxMinutes",
			whenMissing: "warning",
			kind: "number",
			meaning:
				"Minutes to run it. At most 10: an action primitive must be executable without heroics.",
			example: 10,
		},
		{
			name: "steps",
			whenMissing: "warning",
			kind: "list",
			meaning:
				"Concrete actions in order, each one a single person can do within the timebox.",
			example: [
				"Write down the date you were promised and today's date.",
				"Ask who owns the decision and when it will be made.",
				"Ask for that answer in writing.",
			],
		},
		{
			name: "failureLooksLike",
			whenMissing: "warning",
			kind: "list",
			meaning:
				"What the response looks like when the move did not work, so the reader knows to escalate.",
			example: ["The reply names no owner and no date."],
		},
		{
			name: "legitimateDemand",
			whenMissing: "warning",
			kind: "list",
			meaning: "The fair ask the reader can make of the institution.",
			example: ["A named owner and a decision date."],
		},
		STATUS_FIELD,
		{
			name: "owner",
			whenMissing: "optional",
			kind: "string",
			meaning: "Who owns the procedure (runbook books).",
		},
		{
			name: "reviewEveryDays",
			whenMissing: "optional",
			kind: "number",
			meaning: "Review cadence in days (runbook books).",
		},
		{
			name: "runbookSteps",
			whenMissing: "optional",
			kind: "list",
			meaning:
				"Branching steps as { when?, action } objects. Required in runbook books.",
		},
		{
			name: "drills",
			whenMissing: "optional",
			kind: "list",
			meaning: "Exercises that prove the procedure works (runbook books).",
		},
		{
			name: "escalation",
			whenMissing: "optional",
			kind: "object",
			meaning:
				"When to hand off and to whom: { to, when, withinHours? }. Required in runbook books.",
		},
		{
			name: "satisfies",
			whenMissing: "optional",
			kind: "list",
			meaning: "Control IDs this procedure satisfies (runbook audit mapping).",
		},
	],
	example: [
		{
			name: "mechanism",
			whenMissing: "error",
			kind: "slug",
			meaning:
				"Slug of the mechanism this illustrates. It must exist in the book.",
			example: "promise-drift",
		},
		{
			name: "domain",
			whenMissing: "warning",
			kind: "string",
			meaning:
				"The setting. Examples are replaceable: swapping one must not change what the mechanism means.",
			example: "Housing",
		},
		{
			name: "title",
			whenMissing: "warning",
			kind: "string",
			meaning: "The example's name as readers see it.",
			example: "The repair that was always next week",
		},
		{
			name: "summary",
			whenMissing: "optional",
			kind: "string",
			meaning: "One sentence for search results and link previews.",
		},
		STATUS_FIELD,
	],
	chapter: [
		{
			name: "slug",
			whenMissing: "error",
			kind: "slug",
			meaning: "Durable identifier: lowercase words joined by hyphens.",
			example: "05-when-the-date-moves",
		},
		{
			name: "title",
			whenMissing: "error",
			kind: "string",
			meaning: "The chapter's title as readers see it.",
			example: "When the date moves",
		},
		{
			name: "mechanisms",
			whenMissing: "optional",
			kind: "list",
			meaning:
				"Slugs of the mechanisms this chapter uses. Each must exist in the book. Bind an existing mechanism instead of naming a new idea in prose.",
			example: ["promise-drift"],
		},
		{
			name: "prerequisites",
			whenMissing: "optional",
			kind: "list",
			meaning: "Slugs of chapters to read first.",
		},
		{
			name: "summary",
			whenMissing: "optional",
			kind: "string",
			meaning:
				"One or two sentences for search results and link previews; the first paragraph is used when absent.",
		},
		{
			name: "order",
			whenMissing: "optional",
			kind: "number",
			meaning:
				"Reading position, when the file name's number prefix is not enough.",
		},
		STATUS_FIELD,
	],
	glossary: [
		{
			name: "term",
			whenMissing: "warning",
			kind: "string",
			meaning: "The term as readers see it.",
			example: "Promise drift",
		},
		{
			name: "slug",
			whenMissing: "optional",
			kind: "slug",
			meaning: "Identifier; use the mechanism's slug when the term names one.",
		},
		{
			name: "definition",
			whenMissing: "optional",
			kind: "string",
			meaning: "One sentence; otherwise the body is the definition.",
		},
		{
			name: "mechanisms",
			whenMissing: "optional",
			kind: "list",
			meaning: "Slugs of related mechanisms.",
		},
		STATUS_FIELD,
	],
};

export type ContentContract = {
	section: ContentSection;
	/** Folder under `src/content/book/`. */
	directory: string;
	fields: readonly ContractField[];
	/** JSON Schema of the frontmatter, generated from the Zod schema the build uses. */
	jsonSchema: Record<string, unknown>;
	/** A file that compiles with no findings, using the illustrative example values. */
	template: string;
};

type ScaffoldValue = string | number | boolean | readonly string[];

// Slugs and keywords such as `draft` read better bare; everything else is quoted.
const yamlScalar = (value: string | number | boolean): string =>
	typeof value !== "string"
		? String(value)
		: /^[a-z][a-z0-9-]*$/.test(value) &&
				!["true", "false", "null", "yes", "no", "on", "off"].includes(value)
			? value
			: JSON.stringify(value);

const yamlValue = (value: ScaffoldValue): string => {
	if (!Array.isArray(value))
		return ` ${yamlScalar(value as string | number | boolean)}`;
	if (value.length === 0) return " []";
	return `\n${value.map((item) => `  - ${JSON.stringify(item)}`).join("\n")}`;
};

/**
 * A new content file for a section, built from its contract: the given values
 * in contract order, and every required or expected field the caller left out
 * as an empty placeholder carrying what to write as a YAML comment. Empty
 * placeholders are warnings, never errors, so the file builds while it is
 * being filled in. `note` becomes an MDX comment under the frontmatter.
 */
export const scaffoldSource = (
	section: ContentSection,
	values: Record<string, ScaffoldValue | undefined>,
	note?: string,
): string => {
	const fields = FIELDS[section];
	const lines: string[] = [];
	for (const field of fields) {
		const value = values[field.name];
		if (value !== undefined) {
			lines.push(`${field.name}:${yamlValue(value)}`);
		} else if (field.whenMissing !== "optional") {
			const empty =
				field.kind === "list" ? " []" : field.kind === "number" ? "" : ' ""';
			lines.push(`${field.name}:${empty} # ${field.meaning}`);
		}
	}
	for (const [name, value] of Object.entries(values)) {
		if (value !== undefined && !fields.some((field) => field.name === name)) {
			lines.push(`${name}:${yamlValue(value)}`);
		}
	}
	const comment = note ? `\n{/* ${note.replace(/\*\//g, "* /")} */}\n` : "";
	return `---\n${lines.join("\n")}\n---\n${comment}`;
};

const templateFor = (section: ContentSection): string =>
	scaffoldSource(
		section,
		{
			...Object.fromEntries(
				FIELDS[section]
					.filter((field) => field.whenMissing !== "optional")
					.map((field) => [field.name, field.example]),
			),
			status: "draft",
		},
		`Prose for this ${section} goes here.`,
	);

export const contentContract = (section: ContentSection): ContentContract => ({
	section,
	directory: SECTION_DIRECTORIES[section],
	fields: FIELDS[section],
	jsonSchema: z.toJSONSchema(SCHEMAS[section], {
		io: "input",
		unrepresentable: "any",
	}) as Record<string, unknown>,
	template: templateFor(section),
});

export type ContentFindingCode =
	| "FRONTMATTER_MISSING"
	| "FRONTMATTER_INVALID"
	| "FIELD_MISSING"
	| "FIELD_INVALID"
	| "FIELD_MISPLACED"
	| "SLUG_INVALID"
	| "TIMEBOX_TOO_LONG"
	| "UNKNOWN_MECHANISM"
	| "UNKNOWN_PREREQUISITE"
	| "BROKEN_LINK"
	| "UNSAFE_LINK"
	| "UNSAFE_HTML"
	| "IFRAME_NO_TITLE"
	| "DRAFT_IN_RELEASE"
	| "MDX_HTML_COMMENT";

export type ContentFinding = {
	level: "error" | "warning";
	code: ContentFindingCode;
	/** The frontmatter field, when the finding is about one. */
	field?: string;
	message: string;
	/** What to change so the finding goes away. */
	fix?: string;
};

/** A slug retired by a merge: what replaced it, and when. */
export type RetiredSlug = { into: string; date?: string };

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

/** A long value (a document in `srcdoc`, a spread) cut short at 60 characters. */
const shortened = (value: string): string =>
	value.length > 60 ? `${value.slice(0, 59)}…` : value;

/** An attribute as a message shows it: `<img onerror="alert(1)">`, `<a {...props}>`. */
const shownAttribute = (found: UnsafeMarkupEntry & { kind: "attribute" }) => {
	const { attribute, element, expression, value } = found;
	if (attribute === "{...}") return `<${element} ${shortened(value)}>`;
	if (!expression && !value) return `<${element} ${attribute}>`;
	return `<${element} ${attribute}=${expression ? shortened(value) : JSON.stringify(shortened(value))}>`;
};

/** How to do without an element the site leaves out, keeping what it holds. */
const unwrapFix = (element: string): string => {
	if (element === "svg") {
		return "Save the drawing as an .svg file and show it as an image: ![What it shows](/images/drawing.svg).";
	}
	if (element === "video" || element === "audio") {
		return `Link to the recording, or embed the page that plays it with an <iframe src="https://…">.`;
	}
	if (elementReason(element).includes("collects nothing")) {
		return "Link to the form where it is hosted.";
	}
	return `Remove the <${element}> tags, keeping what they hold, or write it in Markdown.`;
};

/** The fix for an attribute the site removes. */
const attributeFix = (found: UnsafeMarkupEntry & { kind: "attribute" }) => {
	const { attribute, element, value } = found;
	switch (found.refusal) {
		case "document":
			return `Point src at a web address or a page of the book in place of srcdoc, or remove the <${element}>.`;
		case "raw-html":
			return "Write the HTML out in the page, or remove set:html.";
		case "expression":
			return `Write ${attribute} as a plain string, as in ${attribute}="…".`;
		case "spread":
			return 'Write each attribute out with a plain string value, as in href="https://example.com".';
		case "permission":
			return `Remove ${extraPermissions(value).join(", ")} from allow.`;
		default:
			return `Remove ${attribute}.`;
	}
};

/**
 * What a finding says about something the site leaves out: a link to an
 * unsafe address (`UNSAFE_LINK`), which keeps its words; or raw HTML the
 * allowlist does not keep (`UNSAFE_HTML`): an element, an attribute, an
 * MDX expression, or an `import`/`export` block.
 */
const unsafeMarkupFinding = (
	label: string,
	found: UnsafeMarkupEntry,
): Pick<ContentFinding, "code" | "message" | "fix"> => {
	const { line } = found;
	const linksOnly = `a book links only to ${SAFE_SCHEME_LIST} addresses and to its own pages`;
	if (found.kind === "link") {
		return {
			code: "UNSAFE_LINK",
			message: `${label} links to ${JSON.stringify(found.href)} on line ${line}, which the site shows only as words: ${linksOnly}`,
			fix: "Link to a web or mail address or a page of the book, or keep the words and remove the link.",
		};
	}
	if (found.kind === "attribute" && found.refusal === "address") {
		const { attribute, element, expression } = found;
		if (element === "a" && attribute === "href") {
			return expression
				? {
						code: "UNSAFE_LINK",
						message: `${label} has a link on line ${line} whose address is an expression (href=${found.value}), which the build cannot check, so the site shows only its words`,
						fix: 'Write the address as a plain string, as in href="https://example.com".',
					}
				: {
						code: "UNSAFE_LINK",
						message: `${label} links to ${JSON.stringify(found.value)} on line ${line}, which the site shows only as words: ${linksOnly}`,
						fix: "Link to a web or mail address or a page of the book, or keep the words and remove the link.",
					};
		}
		const embed = element === "iframe";
		return expression
			? {
					code: "UNSAFE_LINK",
					message: `${label} has ${shownAttribute(found)} on line ${line}, an address the build cannot check, so the site ${embed ? `leaves out the <${element}>` : `removes ${attribute}`}`,
					fix: `Write the address as a plain string, as in ${attribute}="https://example.com".`,
				}
			: {
					code: "UNSAFE_LINK",
					message: `${label} has ${shownAttribute(found)} on line ${line}, ${embed ? "which the site leaves out" : "an address the site removes"}: ${linksOnly}`,
					fix: `Point ${attribute} at a web address or a page of the book, or remove ${embed ? `the <${element}>` : "it"}.`,
				};
	}
	if (found.kind === "attribute") {
		return {
			code: "UNSAFE_HTML",
			message: `${label} has ${shownAttribute(found)} on line ${line}, and the site removes ${found.attribute === "{...}" ? "the spread" : found.attribute}: ${refusalReason(found.refusal, found.element, found.attribute, found.expression ? null : found.value)}`,
			fix: attributeFix(found),
		};
	}
	if (found.kind === "element") {
		const { element } = found;
		if (element === "iframe") {
			return {
				code: "UNSAFE_HTML",
				message: `${label} has an <iframe> with no src on line ${line}, which the site leaves out: it would show nothing`,
				fix: 'Give it the address of the page it embeds, as in <iframe src="https://www.youtube.com/embed/…">, or remove it.',
			};
		}
		return found.keeps === "nothing"
			? {
					code: "UNSAFE_HTML",
					message: `${label} has <${element}> on line ${line}, which the site leaves out with everything inside it: ${elementReason(element)}`,
					fix: `Remove the <${element}>.`,
				}
			: {
					code: "UNSAFE_HTML",
					message: `${label} has <${element}> on line ${line}, which the site leaves out, keeping what it holds: ${elementReason(element)}`,
					fix: unwrapFix(element),
				};
	}
	if (found.kind === "expression") {
		return {
			code: "UNSAFE_HTML",
			message: `${label} has an expression on line ${line} (${shortened(found.source)}), which the site leaves out: the build would run it, and what it writes is not checked`,
			fix: "Write it out as text or Markdown. To show braces, escape them: \\{ and \\}.",
		};
	}
	return {
		code: "UNSAFE_HTML",
		message: `${label} has an ${found.source.startsWith("import") ? "import" : "export"} block on line ${line}, code the build would run, which the site leaves out`,
		fix: "Remove it: content holds no code. Behavior comes from the engine or book.config.ts.",
	};
};

/** Body text outside code, where an HTML comment would reach the MDX compiler. */
const proseOutsideCode = (body: string): string =>
	body.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, "").replace(/`[^`\n]*`/g, "");

/** The body with code blanked out, keeping every offset and line. */
export const maskCode = (body: string): string =>
	body.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`/g, (code) =>
		code.replace(/[^\n]/g, " "),
	);

/** The path segment under /read/ each section's pages are served from. */
const READ_SECTIONS: Record<string, ContentSection> = {
	chapters: "chapter",
	mechanisms: "mechanism",
	toolkit: "tool",
	glossary: "glossary",
	examples: "example",
};

/**
 * Site-relative links to a content page: Markdown links and definitions, and
 * href/src attributes, with an optional locale prefix (`/es/read/...`).
 */
const READ_LINK =
	/(?:\]\(\s*<?|\b(?:href|src)\s*=\s*["']|^[ \t]*\[[^\]\n]+\]:[ \t]*<?)((?:\/[a-z]{2}(?:-[a-z0-9]+)?)?\/read\/([a-z]+)\/([^\s)"'<>#?]+))/gim;

/** What the read routes and the schemas accept as a slug. */
const isValidSlug = (value: string): boolean => SLUG_PATTERN.test(value);

/** The slug an author most likely meant: lowercase words joined by hyphens. */
const suggestedSlug = (value: string): string =>
	value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

/** Strings in a frontmatter list; anything else is left to the schema. */
const stringList = (value: unknown): string[] =>
	Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];

/**
 * Fields of a section's nested objects. Written at the top level they are
 * ignored by the build, and the object they belong to reads as missing.
 */
const NESTED_FIELDS: Partial<
	Record<ContentSection, Record<string, "escalation" | "runbookSteps" | "both">>
> = {
	tool: {
		to: "escalation",
		withinHours: "escalation",
		when: "both",
		action: "runbookSteps",
	},
};

const ESCALATION_EXAMPLE =
	'escalation:\n  to: "<who takes over>"\n  when: "<the condition that hands it off>"\n  withinHours: 2';
const RUNBOOK_STEPS_EXAMPLE =
	'runbookSteps:\n  - when: "<the condition, optional>"\n    action: "<what to do>"';

const misplacedFix = (
	key: string,
	parent: "escalation" | "runbookSteps" | "both",
): string =>
	parent === "escalation"
		? `Indent \`${key}:\` under escalation:, e.g.\n${ESCALATION_EXAMPLE}`
		: parent === "runbookSteps"
			? `Move \`${key}:\` into a runbookSteps item, e.g.\n${RUNBOOK_STEPS_EXAMPLE}`
			: `Indent \`${key}:\` under escalation: (when to hand off) or into a runbookSteps item (when a step applies), e.g.\n${ESCALATION_EXAMPLE}`;

/** Fields a runbook book needs on every tool, beyond the base contract. */
const RUNBOOK_TOOL_FIELDS = ["escalation", "runbookSteps"] as const;

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

/** Up to three candidates sharing the most words (of four letters or more) with `value`. */
export const nearest = (
	value: string,
	candidates: readonly string[],
): string[] => {
	// Short words ("by", "of", "as") match too much to mean anything.
	const words = new Set(value.split("-").filter((word) => word.length > 3));
	return candidates
		.map((candidate) => ({
			candidate,
			shared: candidate.split("-").filter((word) => words.has(word)).length,
		}))
		.filter(({ shared }) => shared > 0)
		.sort((a, b) => b.shared - a.shared)
		.slice(0, 3)
		.map(({ candidate }) => candidate);
};

const unknownMechanismFix = (
	slug: string,
	known: ReadonlySet<string>,
	retired: RetiredSlug | undefined,
): string => {
	if (retired && known.has(retired.into)) {
		return `${slug} was merged into ${retired.into}${retired.date ? ` on ${retired.date}` : ""}; use ${retired.into}.`;
	}
	// A mechanism with an invalid slug is reported on its own file; never offer it here.
	const valid = [...known].filter(isValidSlug);
	const close = nearest(slug, valid);
	return close.length > 0
		? `Use an existing mechanism slug; closest: ${close.join(", ")}. If it is a new idea, add mechanisms/${slug}.mdx first (bun run bookkit similar, or the find_similar_mechanisms tool, finds one that already fits).`
		: `Use one of this book's mechanism slugs (${valid.sort().join(", ") || "none yet"}), or add mechanisms/${slug}.mdx first.`;
};

const SECTION_NOUNS: Record<ContentSection, string> = {
	mechanism: "mechanism",
	tool: "tool",
	example: "example",
	chapter: "chapter",
	glossary: "glossary entry",
};

/** The fix for a reference to a slug the section does not have. */
const unknownSlugFix = (
	slug: string,
	section: ContentSection,
	known: ReadonlySet<string>,
): string => {
	const valid = [...known].filter(isValidSlug).sort();
	const close = nearest(slug, valid);
	const noun = SECTION_NOUNS[section];
	if (close.length > 0)
		return `Use an existing ${noun} slug; closest: ${close.join(", ")}.`;
	return valid.length > 0 && valid.length <= 20
		? `Use one of this book's ${noun} slugs (${valid.join(", ")}), or add that ${noun} first.`
		: `Point it at an existing ${noun}, or add that ${noun} first.`;
};

/** Retired slugs from corpus.json's `merged` records; malformed entries are skipped. */
export const retiredSlugsFromCorpus = (
	corpus: unknown,
): Map<string, RetiredSlug> => {
	const retired = new Map<string, RetiredSlug>();
	const merged = (corpus as { merged?: unknown } | null)?.merged;
	if (!Array.isArray(merged)) return retired;
	for (const merge of merged) {
		const { into, date, before } = (merge ?? {}) as {
			into?: unknown;
			date?: unknown;
			before?: unknown;
		};
		if (typeof into !== "string" || !Array.isArray(before)) continue;
		for (const entry of before) {
			const slug = (entry as { slug?: unknown } | null)?.slug;
			if (typeof slug === "string" && slug !== into) {
				retired.set(slug, {
					into,
					date: typeof date === "string" ? date : undefined,
				});
			}
		}
	}
	return retired;
};

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

/** The mechanism slugs declared by a set of mechanism sources. */
export const mechanismSlugsFrom = (sources: Iterable<string>): Set<string> => {
	const slugs = new Set<string>();
	for (const source of sources) {
		const parsed = parseFrontmatter(source);
		if (parsed.status !== "ok") continue;
		const slug = parsed.data.slug;
		if (typeof slug === "string" && slug.trim()) slugs.add(slug.trim());
	}
	return slugs;
};
