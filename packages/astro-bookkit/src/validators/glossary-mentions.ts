import { FRONTMATTER, parseFrontmatter } from "../utils/frontmatter";
import { splitFencedCode } from "../utils/markdown";

/**
 * Where each chapter first uses a glossary term without linking it. Readers
 * meet a term in prose before they reach its definition, and the site does
 * not link terms for the author, so this lists, for each chapter and term,
 * the first use when it is not inside a link. A term linked at its first use
 * is not listed, nor is any later use. It is advice for the author, never
 * an error.
 */

export type GlossaryTerm = {
	/** The term as the glossary entry names it (`term:`). */
	term: string;
	/** The entry's page slug, for the link to suggest. */
	slug: string;
	/** The entry's locale (`locale:`, else the book's default); a chapter is matched to terms of its own. */
	locale: string;
};

export type GlossaryMention = {
	file: string;
	/** 1-based line in the file, frontmatter included. */
	line: number;
	term: string;
	slug: string;
};

const localeOf = (data: Record<string, unknown>, defaultLocale: string) =>
	(typeof data.locale === "string" && data.locale.trim()
		? data.locale
		: defaultLocale
	).toLowerCase();

const escapeRegExp = (value: string) =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The term, any case, as a whole word, singular or plural ("severity",
 * "severities"; "ramp", "ramps"); spaces match any run of spaces.
 */
const termPattern = (term: string) => {
	const words = term.trim().split(/\s+/).map(escapeRegExp);
	const last = words.pop() ?? "";
	const plural = /y$/i.test(last)
		? `${last.slice(0, -1)}(?:y|ies)`
		: `${last}(?:e?s)?`;
	return new RegExp(
		`(?<![\\p{L}\\p{N}])${[...words, plural].join("\\s+")}(?![\\p{L}\\p{N}])`,
		"iu",
	);
};

/** Same-length text with `pattern`'s matches blanked, so columns still line up. */
const blank = (text: string, pattern: RegExp) =>
	text.replace(pattern, (match) => match.replace(/[^\n]/g, " "));

const MDX_COMMENT = /\{\/\*[\s\S]*?\*\/\}/g;
const INLINE_CODE = /(`+)[\s\S]*?\1/g;
/** `[text](url)`, `[text][ref]`, `[text][]`, and `<a …>text</a>`: group 1 or 2 is the text. */
const LINK =
	/!?\[((?:[^\][]|\[[^\]]*\])*)\](?:\([^)]*\)|\[[^\]]*\])|<a\b[^>]*>([\s\S]*?)<\/a>/gi;
const AUTOLINK = /<(?:https?:|mailto:)[^>\s]*>/gi;
const BARE_URL = /\bhttps?:\/\/\S+/gi;
/** Lines that are not prose a reader takes a term from. */
const SKIPPED_LINE = /^\s*(?:#{1,6}\s|import\s|export\s)/;

/**
 * The chapter's prose, line by line (1-based, as in the file), with code,
 * comments, and link targets blanked, and the ranges each line's link texts
 * cover.
 */
const proseLines = (source: string) => {
	const frontmatter = source.match(FRONTMATTER)?.[0] ?? "";
	const frontmatterLines = frontmatter ? frontmatter.split("\n").length - 1 : 0;
	const lines = source.split("\n");
	const body = [
		...Array.from({ length: frontmatterLines }, () => ""),
		...lines.slice(frontmatterLines),
	].join("\n");
	const prose = splitFencedCode(blank(body, MDX_COMMENT))
		.map((segment) =>
			segment.code ? segment.text.replace(/[^\n]/g, " ") : segment.text,
		)
		.join("\n");
	return prose.split("\n").flatMap((raw, index) => {
		if (SKIPPED_LINE.test(raw)) return [];
		const text = blank(blank(blank(raw, INLINE_CODE), AUTOLINK), BARE_URL);
		const linked: Array<[number, number]> = [];
		for (const match of text.matchAll(LINK)) {
			const start = match.index ?? 0;
			linked.push([start, start + match[0].length]);
		}
		// Link targets are addresses, not prose: blank them, keep the text.
		const shown = text.replace(LINK, (match, label = "", anchorText = "") => {
			const kept = label || anchorText;
			const at = match.indexOf(kept);
			return match
				.split("")
				.map((char, i) =>
					kept && i >= at && i < at + kept.length ? char : " ",
				)
				.join("");
		});
		return [{ line: index + 1, text: shown, linked }];
	});
};

/**
 * Each term's first use in `chapter`'s prose, when that use is not inside a
 * link, in the order the chapter uses them. Headings, code, MDX comments,
 * and link addresses are not prose.
 */
export const firstUnlinkedGlossaryMentions = (
	chapter: { file: string; source: string },
	terms: readonly GlossaryTerm[],
	defaultLocale = "en",
): GlossaryMention[] => {
	const parsed = parseFrontmatter(chapter.source);
	const locale = localeOf(
		parsed.status === "ok" ? parsed.data : {},
		defaultLocale,
	);
	const pending = terms
		.filter((term) => term.term.trim() && term.locale === locale)
		.map((term) => ({ ...term, pattern: termPattern(term.term) }));
	const mentions: GlossaryMention[] = [];
	for (const { line, text, linked } of proseLines(chapter.source)) {
		if (pending.length === 0) break;
		const found = pending
			.map((term) => ({ term, at: text.search(term.pattern) }))
			.filter(({ at }) => at >= 0)
			.sort((a, b) => a.at - b.at);
		for (const { term, at } of found) {
			pending.splice(pending.indexOf(term), 1);
			if (linked.some(([start, end]) => at >= start && at < end)) continue;
			mentions.push({
				file: chapter.file,
				line,
				term: term.term,
				slug: term.slug,
			});
		}
	}
	return mentions;
};

/** The glossary's terms from its files' frontmatter: `term`, and the page slug (`slug`, else the file name). */
export const glossaryTermsFrom = (
	entries: ReadonlyArray<{ file: string; source: string }>,
	defaultLocale = "en",
): GlossaryTerm[] =>
	entries.flatMap(({ file, source }) => {
		const parsed = parseFrontmatter(source);
		if (parsed.status !== "ok") return [];
		const { term, slug } = parsed.data;
		if (typeof term !== "string" || !term.trim()) return [];
		const fromFile = (file.split(/[\\/]/).pop() ?? "").replace(/\.mdx?$/, "");
		return [
			{
				term,
				slug: typeof slug === "string" && slug ? slug : fromFile,
				locale: localeOf(parsed.data, defaultLocale),
			},
		];
	});
