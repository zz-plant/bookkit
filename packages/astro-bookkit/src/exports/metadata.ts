import { createHash } from "node:crypto";
import { formatCalendarDate } from "../utils/calendar-date";
import type { ExportBundle, ExportEntryKind } from "./types";

/**
 * Publication metadata shared by the PDF and EPUB generators. Nothing here
 * reads the clock: rebuilding unchanged content must yield identical files,
 * and an e-reader must see a rebuild as the same book.
 */

// RFC 4122 namespace for URL names.
const URL_NAMESPACE = "6ba7b8119dad11d180b400c04fd430c8";

/**
 * A name-based (version 5) UUID URN. The same name always gives the same
 * identifier, so every build of a publication carries one identifier.
 */
export const exportIdentifier = (name: string): string => {
	const hash = createHash("sha1")
		.update(Buffer.from(URL_NAMESPACE, "hex"))
		.update(name, "utf8")
		.digest();
	hash[6] = (hash[6] & 0x0f) | 0x50;
	hash[8] = (hash[8] & 0x3f) | 0x80;
	const hex = hash.subarray(0, 16).toString("hex");
	return `urn:uuid:${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

/**
 * The name an identifier is derived from: the publication's canonical URL,
 * or a `bookkit:` URI from the slug when the book has no site URL. The
 * version is left out on purpose: EPUB 3 identifies a release by the
 * identifier plus `dcterms:modified`, so readers replace an older version
 * instead of shelving both.
 */
export const exportPublicationName = (
	book: { siteUrl?: string; slug?: string; title: string },
	path = "/",
): string => {
	const siteUrl = book.siteUrl?.trim().replace(/\/+$/, "");
	if (siteUrl) return `${siteUrl}${path}`;
	const base = `bookkit:${book.slug ?? book.title}`;
	return path === "/" ? base : `${base}${path}`;
};

/** Used for EPUB `dcterms:modified` and zip entry times when a book has no dated release. */
export const UNDATED_TIMESTAMP = "1980-01-01T00:00:00Z";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** A release date as an instant: YYYY-MM-DD means midnight UTC. */
export const parseExportDate = (value?: string): Date | undefined => {
	const trimmed = value?.trim();
	if (!trimmed) return undefined;
	const date = new Date(
		DATE_ONLY.test(trimmed) ? `${trimmed}T00:00:00Z` : trimmed,
	);
	return Number.isNaN(date.getTime()) ? undefined : date;
};

/** EPUB 3 `dcterms:modified` form: CCYY-MM-DDThh:mm:ssZ, without fractional seconds. */
export const toEpubTimestamp = (date: Date): string =>
	`${date.toISOString().slice(0, 19)}Z`;

/** The label above an entry's title, as the read UI's eyebrow; chapters carry none. */
export const EXPORT_KIND_LABELS: Record<ExportEntryKind, string | null> = {
	chapter: null,
	mechanism: "Mechanism",
	tool: "Toolkit action",
	glossary: "Glossary",
	example: "Example",
};

/** The line under the title, e.g. "Draft · Version 0.2.0 · September 15, 2024". */
export const formatExportEdition = (
	bundle: Pick<ExportBundle, "draft" | "version" | "updatedAt">,
): string => {
	return [
		bundle.draft ? "Draft" : null,
		bundle.version ? `Version ${bundle.version}` : null,
		// The release's calendar date, as the release notes page shows it.
		bundle.updatedAt ? formatCalendarDate(bundle.updatedAt) : null,
	]
		.filter(Boolean)
		.join(" · ");
};
