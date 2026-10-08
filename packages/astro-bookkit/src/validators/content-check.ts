import { type ZodType, z } from "zod";
import {
	chapterSchema,
	exampleSchema,
	glossarySchema,
	mechanismSchema,
	toolkitSchema,
} from "../schemas";
import { parseFrontmatter } from "../utils/frontmatter";

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
	meaning: "draft (default), in-review, published, or stable.",
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
			meaning: "Branching steps as { when?, action } objects (runbook books).",
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
				"When to hand off and to whom: { to, when, withinHours? } (runbook books).",
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
		{
			...STATUS_FIELD,
			meaning: `${STATUS_FIELD.meaning} Release validation (--no-drafts) refuses draft examples.`,
		},
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
	| "TIMEBOX_TOO_LONG"
	| "UNKNOWN_MECHANISM"
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
	/** Slugs merged away (corpus.json `merged`), so a stale reference names its replacement. */
	retiredSlugs?: ReadonlyMap<string, RetiredSlug>;
	/** Release validation (`--no-drafts`): draft examples are errors. */
	releaseMode?: boolean;
	/** `mdx` (default) rejects HTML comments, which the MDX compiler cannot parse. */
	format?: "mdx" | "md";
};

/** Body text outside code, where an HTML comment would reach the MDX compiler. */
const proseOutsideCode = (body: string): string =>
	body.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, "").replace(/`[^`\n]*`/g, "");

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

/** The fix for a missing field: what to add and what it means. */
const missingFix = (field: ContractField): string =>
	`Add \`${field.name}:\` (${field.meaning})${exampleText(field)}`;

const nearest = (value: string, candidates: readonly string[]): string[] => {
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
	const close = nearest(slug, [...known]);
	return close.length > 0
		? `Use an existing mechanism slug; closest: ${close.join(", ")}. If it is a new idea, add mechanisms/${slug}.mdx first (run find_similar_mechanisms before coining one).`
		: `Use one of this book's mechanism slugs (${[...known].sort().join(", ") || "none yet"}), or add mechanisms/${slug}.mdx first.`;
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
	const reported = new Set<string>();
	for (const field of FIELDS[section]) {
		if (field.whenMissing === "optional") continue;
		const value =
			section === "tool" && field.name === "name"
				? (data.name ?? data.title)
				: data[field.name];
		if (isPresent(field, value)) continue;
		reported.add(field.name);
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

	if (context.releaseMode && section === "example" && data.status === "draft") {
		findings.push({
			level: "error",
			code: "DRAFT_IN_RELEASE",
			field: "status",
			message: "Draft examples are forbidden in release mode",
			fix: "Set status to in-review, published, or stable once the example is ready, or remove it from the release.",
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
