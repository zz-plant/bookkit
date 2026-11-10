/**
 * The content contract: the sections, each record type's fields (FIELDS),
 * the fields of its nested objects, what the runbook frame adds to a tool,
 * and the finding a check reports against them.
 */

import type { ZodType } from "zod";
import {
	chapterSchema,
	exampleSchema,
	glossarySchema,
	mechanismSchema,
	toolkitSchema,
} from "../../schemas";

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

export const LABELS: Record<ContentSection, string> = {
	mechanism: "Mechanism",
	tool: "Tool",
	example: "Example",
	chapter: "Chapter",
	glossary: "Glossary",
};

export const SCHEMAS: Record<ContentSection, ZodType> = {
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
export const FIELDS: Record<ContentSection, readonly ContractField[]> = {
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

/**
 * Fields of a section's nested objects. Written at the top level they are
 * ignored by the build, and the object they belong to reads as missing.
 */
export const NESTED_FIELDS: Partial<
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

export const misplacedFix = (
	key: string,
	parent: "escalation" | "runbookSteps" | "both",
): string =>
	parent === "escalation"
		? `Indent \`${key}:\` under escalation:, e.g.\n${ESCALATION_EXAMPLE}`
		: parent === "runbookSteps"
			? `Move \`${key}:\` into a runbookSteps item, e.g.\n${RUNBOOK_STEPS_EXAMPLE}`
			: `Indent \`${key}:\` under escalation: (when to hand off) or into a runbookSteps item (when a step applies), e.g.\n${ESCALATION_EXAMPLE}`;

/** Fields a runbook book needs on every tool, beyond the base contract. */
export const RUNBOOK_TOOL_FIELDS = ["escalation", "runbookSteps"] as const;

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
