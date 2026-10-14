import { z } from "zod";

/**
 * Where a book (`status` in book.config.ts) or a content record (`status` in
 * its frontmatter) stands. Books and records share the list:
 *
 * - `draft` (the default): being written.
 * - `in-review`: complete and out for review, not yet released.
 * - `published`: released to readers.
 * - `stable`: released, and its meaning is settled; redefining it is a
 *   breaking change.
 *
 * The book's status decides the rules: a released book (published or stable)
 * is validated with release rules and may be indexed by search engines; any
 * other book is built with its drafts and kept out of search.
 */
export const STATUSES = ["draft", "in-review", "published", "stable"] as const;

export type Status = (typeof STATUSES)[number];

export const statusSchema = z.enum(STATUSES).default("draft");

export const isStatus = (value: unknown): value is Status =>
	typeof value === "string" && (STATUSES as readonly string[]).includes(value);

/** Published and stable are released; draft, in-review, and no status are not. */
export const isReleasedStatus = (status: unknown): boolean =>
	status === "published" || status === "stable";
