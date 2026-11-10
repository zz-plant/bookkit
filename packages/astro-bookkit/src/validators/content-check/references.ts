/**
 * References between records: mechanism slugs, prerequisites, and /read
 * links in the body. What a slug may be, where a link points, the fix for a
 * reference that names nothing (UNKNOWN_MECHANISM, UNKNOWN_PREREQUISITE,
 * BROKEN_LINK), and the slugs a merge retired.
 */

import { SLUG_PATTERN } from "../../schemas/slug";
import { parseFrontmatter } from "../../utils/frontmatter";
import type { ContentSection } from "./contract";

/** A slug retired by a merge: what replaced it, and when. */
export type RetiredSlug = { into: string; date?: string };

/** The body with code blanked out, keeping every offset and line. */
export const maskCode = (body: string): string =>
	body.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`/g, (code) =>
		code.replace(/[^\n]/g, " "),
	);

/** The path segment under /read/ each section's pages are served from. */
export const READ_SECTIONS: Record<string, ContentSection> = {
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
export const READ_LINK =
	/(?:\]\(\s*<?|\b(?:href|src)\s*=\s*["']|^[ \t]*\[[^\]\n]+\]:[ \t]*<?)((?:\/[a-z]{2}(?:-[a-z0-9]+)?)?\/read\/([a-z]+)\/([^\s)"'<>#?]+))/gim;

/** What the read routes and the schemas accept as a slug. */
export const isValidSlug = (value: string): boolean => SLUG_PATTERN.test(value);

/** The slug an author most likely meant: lowercase words joined by hyphens. */
export const suggestedSlug = (value: string): string =>
	value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

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

export const unknownMechanismFix = (
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

export const SECTION_NOUNS: Record<ContentSection, string> = {
	mechanism: "mechanism",
	tool: "tool",
	example: "example",
	chapter: "chapter",
	glossary: "glossary entry",
};

/** The fix for a reference to a slug the section does not have. */
export const unknownSlugFix = (
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
