/** The content section an export entry was built from. */
export type ExportEntryKind =
	| "chapter"
	| "mechanism"
	| "tool"
	| "glossary"
	| "example";

/** One readable unit of an export: a chapter, mechanism, toolkit action, glossary term, or example. */
export type ExportEntry = {
	kind: ExportEntryKind;
	slug: string;
	title: string;
	/** Markdown: the record's structured fields (definition, steps, escalation…) followed by its body. */
	body: string;
	description?: string;
	locale?: string;
	/** Entries read as part of this one, such as a mechanism's toolkit actions. */
	children?: ExportEntry[];
};

/** A titled run of entries, such as "Chapters" or "Glossary". */
export type ExportPart = {
	title: string;
	entries: ExportEntry[];
};

export type ExportBundle = {
	title: string;
	author?: string;
	/** Same for every build and every version of this publication, e.g. `urn:uuid:…`. */
	identifier?: string;
	/** BCP 47 language tag of the text. */
	language?: string;
	/** Version of the latest release, e.g. "0.2.0". */
	version?: string;
	/** Date of that release (YYYY-MM-DD or ISO 8601). Never the build time. */
	updatedAt?: string;
	draft?: boolean;
	/** The book's public URL; links to pages outside the export point there. */
	siteUrl?: string;
	parts: ExportPart[];
};

export type ExportFormat = "pdf" | "epub";

export type ExportMetadata = {
	format: ExportFormat;
	sizeBytes: number;
	updatedAt?: string;
	scope: "book" | "chapter";
	slug?: string;
};

export type ExportLink = {
	label: string;
	href: string;
	format: ExportFormat;
	size?: string;
	updatedAt?: string;
	scope?: "book" | "chapter";
	slug?: string;
};

export type ExportLinkOptions = {
	bundle: ExportBundle;
	scope: "book" | "chapter";
	slug?: string;
	title?: string;
	basePath?: string;
	formats?: ExportFormat[];
};

/** Raw MDX source per content section, keyed by file path. */
export type ExportRawModules = {
	chapters?: Record<string, string>;
	mechanisms?: Record<string, string>;
	toolkit?: Record<string, string>;
	glossary?: Record<string, string>;
	examples?: Record<string, string>;
};

export type BookExportInfo = {
	title: string;
	/** Used for the publication identifier when the book has no site URL. */
	slug?: string;
	author?: string;
	siteUrl?: string;
	language?: string;
	version?: string;
	updatedAt?: string;
	draft?: boolean;
	/** Mechanism slugs in the author's order; others follow by title. */
	mechanismOrder?: readonly string[];
};

export type BookExportHelperOptions = {
	book: BookExportInfo;
	modules: ExportRawModules;
	basePath?: string;
	formats?: ExportFormat[];
};
