import { SECTION_NAMES } from "./tool-handlers/book-arg";
import type { ToolDefinitionMetadata } from "./tool-handlers/types";

export const TOOL_NAMES = [
	"bookkit.create_book",
	"bookkit.read_book",
	"bookkit.list_books",
	"bookkit.list_content",
	"bookkit.list_skills",
	"bookkit.list_mechanisms",
	"bookkit.validate_book",
	"bookkit.compile_book",
	"bookkit.export_book",
	"bookkit.check_separation",
	"bookkit.check_corpus",
	"bookkit.find_similar_mechanisms",
	"bookkit.get_content_contract",
	"bookkit.check_content",
	"bookkit.write_content",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];
export const TOOL_NAME_SET: ReadonlySet<string> = new Set<string>(TOOL_NAMES);
export const isToolName = (value: unknown): value is ToolName =>
	typeof value === "string" && TOOL_NAME_SET.has(value);

export const TOOL_DEFINITIONS: readonly ToolDefinitionMetadata[] = [
	{
		name: "bookkit.create_book",
		description:
			"Scaffold a new book app in apps/<book> from the engine's starter template (bun run new:book).",
		safety: "requires_guard",
		expectedRuntime: "<=30s",
		expectedRuntimeClass: "moderate",
		sideEffectLevel: "local-write",
		idempotent: false,
		idempotencyGuarantee: "non-idempotent",
		retryGuidance:
			"Do not blindly retry. If creation fails, inspect stderr and remove partial output before rerunning.",
		retryPolicyGuidance:
			"Retry only after inspecting stderr and clearing any partially created app directory to avoid duplicate or conflicting scaffolds.",
		failureClassTaxonomy: [
			"validation",
			"conflict",
			"filesystem",
			"transient-command",
			"unknown",
		],
		inputSchema: {
			type: "object",
			properties: {
				book: {
					type: "string",
					description:
						'Required slug for the new book (for example, field-notes). A title such as "Field Notes" is made a slug, and becomes the title unless title is given.',
				},
				title: {
					type: "string",
					description: "Optional display title for the generated book config.",
				},
				frame: {
					type: "string",
					description:
						"Optional frame: intervention (default), explainer, field-guide, or runbook.",
				},
			},
			required: ["book"],
			additionalProperties: false,
		},
	},
	{
		name: "bookkit.read_book",
		description:
			"Read a book's content. Without slug: an index of records (section, slug, title, lines). With slug, or full: true, the text as well.",
		safety: "read_only",
		expectedRuntime: "<1s",
		expectedRuntimeClass: "instant",
		sideEffectLevel: "read-only",
		idempotent: true,
		idempotencyGuarantee: "idempotent-safe-retry",
		retryGuidance: "Safe to retry.",
		retryPolicyGuidance:
			"Retry immediately for transient transport or timeout failures; repeated retries are safe.",
		failureClassTaxonomy: ["validation", "not-found", "timeout", "unknown"],
		inputSchema: {
			type: "object",
			properties: {
				section: {
					type: "string",
					enum: SECTION_NAMES,
					description:
						"Optional content section filter, singular or plural (chapter or chapters).",
				},
				slug: {
					type: "string",
					description: "Optional slug: returns that record with its text.",
				},
				full: {
					type: "boolean",
					description:
						"true returns the text of every record listed, not only the index. Large for a whole book; filter by section first.",
				},
				book: {
					type: "string",
					description:
						"Another book in the workspace (bookkit.list_books lists them). Defaults to the served book.",
				},
			},
			additionalProperties: false,
		},
	},
	{
		name: "bookkit.list_books",
		description: "List available book slugs in this workspace.",
		safety: "read_only",
		expectedRuntime: "<10s",
		expectedRuntimeClass: "short",
		sideEffectLevel: "read-only",
		idempotent: true,
		idempotencyGuarantee: "idempotent-safe-retry",
		retryGuidance: "Safe to retry on timeout or transient command errors.",
		retryPolicyGuidance:
			"Use bounded retries with backoff for timeout or transient command errors.",
		failureClassTaxonomy: [
			"timeout",
			"transient-command",
			"filesystem",
			"unknown",
		],
		inputSchema: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
	},
	{
		name: "bookkit.list_content",
		description: "List available content section counts for a book.",
		safety: "read_only",
		expectedRuntime: "<1s",
		expectedRuntimeClass: "instant",
		sideEffectLevel: "read-only",
		idempotent: true,
		idempotencyGuarantee: "idempotent-safe-retry",
		retryGuidance: "Safe to retry.",
		retryPolicyGuidance:
			"Retry immediately for transient failures; operation is read-only and deterministic for a fixed workspace state.",
		failureClassTaxonomy: ["configuration", "timeout", "unknown"],
		inputSchema: {
			type: "object",
			properties: {
				book: {
					type: "string",
					description:
						"Another book in the workspace (bookkit.list_books lists them). Defaults to the served book.",
				},
			},
			additionalProperties: false,
		},
	},
	{
		name: "bookkit.list_skills",
		description:
			"List local agent skills that can guide contribution workflows.",
		safety: "read_only",
		expectedRuntime: "<1s",
		expectedRuntimeClass: "instant",
		sideEffectLevel: "read-only",
		idempotent: true,
		idempotencyGuarantee: "idempotent-safe-retry",
		retryGuidance: "Safe to retry.",
		retryPolicyGuidance:
			"Retry immediately when I/O read fails transiently; no mutation is performed.",
		failureClassTaxonomy: ["filesystem", "timeout", "unknown"],
		inputSchema: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
	},
	{
		name: "bookkit.list_mechanisms",
		description: "List mechanism slugs, titles, and MCP resource URIs.",
		safety: "read_only",
		expectedRuntime: "<1s",
		expectedRuntimeClass: "instant",
		sideEffectLevel: "read-only",
		idempotent: true,
		idempotencyGuarantee: "idempotent-safe-retry",
		retryGuidance: "Safe to retry.",
		retryPolicyGuidance:
			"Retry immediately for transient failures; use list_books/read_book if persistent data-shape issues occur.",
		failureClassTaxonomy: ["validation", "configuration", "timeout", "unknown"],
		inputSchema: {
			type: "object",
			properties: {
				section: {
					type: "string",
					enum: ["mechanisms", "mechanism"],
					description: "Optional. Currently only mechanisms are supported.",
				},
				book: {
					type: "string",
					description:
						"Another book in the workspace (bookkit.list_books lists them). Defaults to the served book.",
				},
			},
			additionalProperties: false,
		},
	},
	{
		name: "bookkit.validate_book",
		description:
			"Validate a book with the checks bun run validate runs, in process. The book's status in book.config.ts sets the rules: a published or stable book gets release rules (draft records, broken links, unknown prerequisites, and missing runbook fields are errors); a draft or in-review book does not. Each finding has a code, the field, a fix, and its file.",
		safety: "read_only",
		expectedRuntime: "<=10m",
		expectedRuntimeClass: "long",
		sideEffectLevel: "local-read/compute",
		idempotent: true,
		idempotencyGuarantee: "idempotent-retry-after-remediation",
		retryGuidance:
			"Retry after fixing validation errors or transient command failures.",
		retryPolicyGuidance:
			"Retry only after remediating validation findings; for transient execution failures, use backoff and cap retries.",
		failureClassTaxonomy: [
			"validation",
			"configuration",
			"timeout",
			"transient-command",
			"unknown",
		],
		inputSchema: {
			type: "object",
			properties: {
				book: {
					type: "string",
					description:
						"Optional book slug. Defaults to the current endpoint book when omitted.",
				},
				releaseMode: {
					type: "boolean",
					description:
						"true applies release rules to a draft or in-review book too, to see what publishing it would need. Omitted or false: the book's status decides.",
				},
			},
			additionalProperties: false,
		},
	},
	{
		name: "bookkit.compile_book",
		description:
			"Validate and build a book (bun run compile:book). The book's status in book.config.ts sets the rules: a published or stable book gets release rules (draft records, broken links, unknown prerequisites, and missing runbook fields are errors); a draft or in-review book does not. Validation errors stop the compile.",
		safety: "mutating",
		expectedRuntime: "<=2m",
		expectedRuntimeClass: "moderate",
		sideEffectLevel: "local-write",
		idempotent: true,
		idempotencyGuarantee: "idempotent-safe-retry",
		retryGuidance:
			"Safe to retry. Output is deterministic for unchanged content.",
		retryPolicyGuidance:
			"Retry on transient failures. If content hasn't changed, output will be identical.",
		failureClassTaxonomy: [
			"validation",
			"configuration",
			"timeout",
			"transient-command",
			"unknown",
		],
		inputSchema: {
			type: "object",
			properties: {
				book: {
					type: "string",
					description: "Optional book slug. Defaults to current endpoint book.",
				},
			},
			additionalProperties: false,
		},
	},
	{
		name: "bookkit.export_book",
		description: "Export compiled book output in GitBook-compatible format.",
		safety: "mutating",
		expectedRuntime: "<=1m",
		expectedRuntimeClass: "moderate",
		sideEffectLevel: "local-write",
		idempotent: true,
		idempotencyGuarantee: "idempotent-safe-retry",
		retryGuidance:
			"Safe to retry. Export output overwrites previous export for the same book.",
		retryPolicyGuidance:
			"Retry on transient failures. Re-run compile_book first if content changes between attempts.",
		failureClassTaxonomy: [
			"validation",
			"configuration",
			"filesystem",
			"timeout",
			"transient-command",
			"unknown",
		],
		inputSchema: {
			type: "object",
			properties: {
				book: {
					type: "string",
					description: "Optional book slug. Defaults to current endpoint book.",
				},
			},
			additionalProperties: false,
		},
	},
	{
		name: "bookkit.check_separation",
		description: "Run architecture-boundary checks for the workspace.",
		safety: "read_only",
		expectedRuntime: "<30s",
		expectedRuntimeClass: "moderate",
		sideEffectLevel: "local-read/compute",
		idempotent: true,
		idempotencyGuarantee: "idempotent-retry-after-remediation",
		retryGuidance: "Retry after resolving separation violations.",
		retryPolicyGuidance:
			"Retry after fixing reported separation violations; transient command failures can be retried with short backoff.",
		failureClassTaxonomy: [
			"validation",
			"configuration",
			"transient-command",
			"unknown",
		],
		inputSchema: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
	},
	{
		name: "bookkit.check_corpus",
		description:
			"Compare mechanisms across the corpus books (corpus.json): clusters of overlapping mechanisms, shared slugs whose contracts drifted, and stale rulings. Use before naming or editing a mechanism. semantic: true also compares meaning, but only when the embedding model (~520 MB) is already downloaded or the server's environment sets BOOKKIT_DOWNLOAD_MODEL=1; otherwise the result compares wording only and its summary says so.",
		safety: "read_only",
		expectedRuntime:
			"<30s (semantic with BOOKKIT_DOWNLOAD_MODEL=1: the first run downloads a ~520 MB model)",
		expectedRuntimeClass: "moderate",
		sideEffectLevel: "local-read/compute",
		idempotent: true,
		idempotencyGuarantee: "idempotent-safe-retry",
		retryGuidance:
			"Safe to retry. A wording-only result for semantic: true will repeat until the model is downloaded (BOOKKIT_DOWNLOAD_MODEL=1).",
		retryPolicyGuidance:
			"Retry once on transient command failure; when the summary says it compared wording only, retrying does not help until the model is downloaded.",
		failureClassTaxonomy: [
			"validation",
			"configuration",
			"timeout",
			"transient-command",
			"unknown",
		],
		inputSchema: {
			type: "object",
			properties: {
				semantic: {
					type: "boolean",
					description:
						"Compare meaning with the local embedding model as well as wording. Runs only if the model is already downloaded or BOOKKIT_DOWNLOAD_MODEL=1 is set where the server runs; otherwise falls back to wording and says so. Default false (wording only, fast).",
				},
			},
			additionalProperties: false,
		},
	},
	{
		name: "bookkit.find_similar_mechanisms",
		description:
			"Before coining a mechanism, list existing ones in any book that it may duplicate, and whether its slug already exists. Bind an existing slug when one fits. Pass semantic: true to rank by meaning, which finds the same idea in different words.",
		safety: "read_only",
		expectedRuntime:
			"<5s by wording; ~10s by meaning (with BOOKKIT_DOWNLOAD_MODEL=1, the first run downloads a ~520 MB model)",
		expectedRuntimeClass: "short",
		sideEffectLevel: "read-only",
		idempotent: true,
		idempotencyGuarantee: "idempotent-safe-retry",
		retryGuidance: "Safe to retry.",
		retryPolicyGuidance:
			"Retry immediately for transient command failures; repeated retries are safe.",
		failureClassTaxonomy: ["validation", "transient-command", "unknown"],
		inputSchema: {
			type: "object",
			properties: {
				title: {
					type: "string",
					description: "Proposed mechanism title.",
				},
				definition: {
					type: "string",
					description:
						"Optional one-sentence definition; it joins the comparison.",
				},
				semantic: {
					type: "boolean",
					description:
						"Rank by meaning with the local embedding model. Runs only if the model is already downloaded or BOOKKIT_DOWNLOAD_MODEL=1 is set where the server runs; otherwise ranks by wording, and result.note says why. Default false.",
				},
			},
			required: ["title"],
			additionalProperties: false,
		},
	},
	{
		name: "bookkit.get_content_contract",
		description:
			"What a content file must contain to compile, per section (mechanism, tool, example, chapter, glossary): each field, whether its absence is an error or a warning, what to write in it, the frontmatter's JSON Schema, and a template that compiles. Read it before drafting a file.",
		safety: "read_only",
		expectedRuntime: "<1s",
		expectedRuntimeClass: "instant",
		sideEffectLevel: "read-only",
		idempotent: true,
		idempotencyGuarantee: "idempotent-safe-retry",
		retryGuidance: "Safe to retry.",
		retryPolicyGuidance: "Deterministic; retries return the same contract.",
		failureClassTaxonomy: ["validation", "unknown"],
		inputSchema: {
			type: "object",
			properties: {
				section: {
					type: "string",
					enum: SECTION_NAMES,
					description:
						"One section, singular or plural (chapter or chapters); omit for all five.",
				},
			},
			additionalProperties: false,
		},
	},
	{
		name: "bookkit.check_content",
		description:
			"Compile one candidate content file without writing it: the checks bun run validate runs, against the book (mechanism references, prerequisites and /read/ links, its frame and status) and the MDX compiler its build uses. Each finding has a code, the field, and a fix. Draft, check until ok, then write the file (bookkit.write_content writes it for you); the compiler decides, not the draft.",
		safety: "read_only",
		expectedRuntime: "<5s",
		expectedRuntimeClass: "short",
		sideEffectLevel: "read-only",
		idempotent: true,
		idempotencyGuarantee: "idempotent-safe-retry",
		retryGuidance: "Apply the fixes in the findings, then check again.",
		retryPolicyGuidance:
			"Deterministic; the same source always gives the same findings.",
		failureClassTaxonomy: ["validation", "unknown"],
		inputSchema: {
			type: "object",
			properties: {
				section: {
					type: "string",
					enum: SECTION_NAMES,
					description:
						"Which kind of file the source is, singular or plural (chapter or chapters).",
				},
				source: {
					type: "string",
					description: "The full file text, frontmatter included.",
				},
				book: {
					type: "string",
					description:
						"Book the file is checked against (its mechanisms, slugs, frame, and status). Defaults to the served book.",
				},
				format: {
					type: "string",
					enum: ["mdx", "md"],
					description:
						"mdx (default) compiles the file as MDX; md is for a .md file, where HTML comments are allowed.",
				},
				releaseMode: {
					type: "boolean",
					description:
						"true applies release rules whatever the book's status: a draft record is an error, and so are broken links and unknown prerequisites. Omitted or false: the book's status in book.config.ts decides (release rules for published or stable), and a record whose own status is published or stable is always held to them.",
				},
			},
			required: ["section", "source"],
			additionalProperties: false,
		},
	},
	{
		name: "bookkit.write_content",
		description:
			"Check one content file as bookkit.check_content does and, when it passes, write it into the book: a chapter after the last one, an example under its mechanism, anything else as <slug>.mdx. A file that already exists is replaced only with overwrite: true.",
		safety: "requires_guard",
		expectedRuntime: "<5s",
		expectedRuntimeClass: "short",
		sideEffectLevel: "local-write",
		idempotent: true,
		idempotencyGuarantee: "idempotent-retry-after-remediation",
		retryGuidance:
			"Apply the fixes in the findings, then call again. A second call with the same source refuses to overwrite unless overwrite: true.",
		retryPolicyGuidance:
			"Retry after fixing findings; pass overwrite: true only to replace a file you have read.",
		failureClassTaxonomy: ["validation", "conflict", "filesystem", "unknown"],
		inputSchema: {
			type: "object",
			properties: {
				section: {
					type: "string",
					enum: SECTION_NAMES,
					description:
						"Which kind of file the source is, singular or plural (chapter or chapters).",
				},
				source: {
					type: "string",
					description: "The full file text, frontmatter included.",
				},
				book: {
					type: "string",
					description:
						"Another book in the workspace (bookkit.list_books lists them). Defaults to the served book. The file is written there.",
				},
				file: {
					type: "string",
					description:
						"Optional file name inside the section folder (for example 05-intro.mdx). Omitted: chosen from the slug, a chapter numbered after the last.",
				},
				overwrite: {
					type: "boolean",
					description: "true replaces a file that already exists.",
				},
				releaseMode: {
					type: "boolean",
					description: "As for bookkit.check_content.",
				},
			},
			required: ["section", "source"],
			additionalProperties: false,
		},
	},
];
