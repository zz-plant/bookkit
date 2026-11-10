/**
 * Rules that need more than one record, or the files around it: images a
 * record shows (IMAGE_MISSING), prerequisite order and cycles
 * (PREREQUISITE_ORDER, PREREQUISITE_CYCLE), slugs used twice (DUPLICATE_SLUG),
 * an action and an example per mechanism (MECHANISM_NO_ACTION,
 * MECHANISM_NO_EXAMPLE), and release notes (RELEASE_NOTE_*).
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { detectCycles, type GraphNode } from "../../utils/graph";
import { type ContentSection, maskCode } from "../content-check";
import { checkReleaseNote } from "../release-note";
import {
	type BookFinding,
	listFiles,
	type ParsedSource,
	routeSlug,
} from "./sources";

// `![alt](src)` and `<img src="…">`: the images a record shows.
const IMAGE_SOURCES =
	/!\[[^\]\n]*\]\(\s*<?([^\s)>]+)|<img\b[^>]*?\ssrc\s*=\s*["']?([^"'\s>]+)/gi;

/**
 * Images a record shows that are not in the book: a path under the book's
 * `public/` folder (`/images/x.png`), or one relative to the record, that
 * names no file. The site shows a broken image and the PDF its alt text.
 * Addresses on the web are not checked.
 */
export const missingImageFindings = (
	workspaceRoot: string,
	book: string,
	file: string,
	source: string,
	releaseMode: boolean,
): BookFinding[] => {
	const publicDir = join(workspaceRoot, "apps", book, "public");
	const masked = maskCode(source);
	const findings: BookFinding[] = [];
	for (const match of masked.matchAll(IMAGE_SOURCES)) {
		const src = (match[1] ?? match[2] ?? "").trim();
		if (!src || /^([a-z][a-z0-9+.-]*:|\/\/|#|\{)/i.test(src)) continue;
		let path = src.split(/[?#]/)[0];
		try {
			path = decodeURIComponent(path);
		} catch {
			// Keep the path as written.
		}
		const target = path.startsWith("/")
			? join(publicDir, path)
			: join(dirname(file), path);
		if (existsSync(target)) continue;
		const line = source.slice(0, match.index ?? 0).split("\n").length;
		findings.push({
			level: releaseMode ? "error" : "warning",
			code: "IMAGE_MISSING",
			file,
			message: `Shows the image ${src} on line ${line}, but there is no file at ${relative(workspaceRoot, target)}`,
			fix: path.startsWith("/")
				? `Put the image at ${relative(workspaceRoot, target)} (a path that starts with / is read from the book's public/ folder), or fix the path.`
				: "A relative path is read from the record's own folder; fix the path, or put the image under the book's public/ folder and write /images/<name>.",
		});
	}
	return findings;
};

/**
 * Chapters that list a prerequisite readers reach only later. Readers meet
 * chapters in reading order (an explicit `order`, else file order, as the
 * read pages and exports list them), so the prerequisite graph and that
 * order must agree.
 */
export const prerequisiteOrderFindings = (
	chapters: readonly ParsedSource[],
): BookFinding[] => {
	const orderOf = (data: Record<string, unknown> | null) =>
		typeof data?.order === "number" ? data.order : Number.POSITIVE_INFINITY;
	const reading = chapters
		.filter((chapter) => chapter.data)
		.map((chapter, index) => ({ chapter, index }))
		.sort(
			(a, b) =>
				orderOf(a.chapter.data) - orderOf(b.chapter.data) ||
				(a.chapter.file < b.chapter.file ? -1 : 1),
		)
		.map(({ chapter }) => chapter);
	const position = new Map(
		reading.map((chapter, index) => [
			routeSlug(chapter.file, chapter.data ?? {}),
			index,
		]),
	);
	return reading.flatMap((chapter, index) => {
		const slug = routeSlug(chapter.file, chapter.data ?? {});
		const prerequisites = Array.isArray(chapter.data?.prerequisites)
			? chapter.data.prerequisites.filter(
					(item): item is string => typeof item === "string",
				)
			: [];
		return prerequisites
			.filter((prerequisite) => (position.get(prerequisite) ?? -1) > index)
			.map((prerequisite) => ({
				level: "warning" as const,
				code: "PREREQUISITE_ORDER",
				field: "prerequisites",
				file: chapter.file,
				message: `Chapter "${slug}" lists prerequisite "${prerequisite}", which readers reach only after it`,
				fix: `Move "${prerequisite}" before "${slug}" (by file name, or with \`order:\`), or remove the prerequisite.`,
			}));
	});
};

export const prerequisiteCycleFindings = (
	chapters: readonly ParsedSource[],
): BookFinding[] => {
	const nodes: GraphNode[] = chapters.map((chapter) => ({
		slug: routeSlug(chapter.file, chapter.data ?? {}),
		title:
			typeof chapter.data?.title === "string"
				? chapter.data.title
				: routeSlug(chapter.file, chapter.data ?? {}),
		prerequisites: Array.isArray(chapter.data?.prerequisites)
			? chapter.data.prerequisites.filter(
					(item): item is string => typeof item === "string",
				)
			: [],
	}));
	const cycleResult = detectCycles(nodes);
	if (!cycleResult.hasCycle) return [];
	const chapterBySlug = new Map(
		chapters.map((c) => [routeSlug(c.file, c.data ?? {}), c]),
	);
	return cycleResult.cycles.map((cycle) => {
		const startSlug = cycle[0];
		const file = chapterBySlug.get(startSlug)?.file ?? chapters[0]?.file;
		const cycleDesc = cycle.join(" -> ");
		return {
			level: "error",
			code: "PREREQUISITE_CYCLE",
			field: "prerequisites",
			file,
			message: `Prerequisite cycle detected in chapters: ${cycleDesc}`,
			fix: `Break the cycle by removing or relaxing prerequisites in one of: ${cycle.slice(0, -1).join(", ")}.`,
		};
	});
};

/**
 * Two records of a section served at the same slug (in the same locale): the
 * site builds one page for it and drops the other, while the PDF and EPUB
 * include every chapter.
 */
export const duplicateSlugFindings = (
	root: string,
	section: ContentSection,
	parsed: ParsedSource[],
): BookFinding[] => {
	const first = new Map<string, string>();
	const findings: BookFinding[] = [];
	for (const { file, data } of parsed) {
		if (!data) continue;
		const slug = routeSlug(file, data);
		const locale = typeof data.locale === "string" ? data.locale : "";
		const key = `${slug}\u0000${locale.toLowerCase()}`;
		const earlier = first.get(key);
		if (!earlier) {
			first.set(key, file);
			continue;
		}
		findings.push({
			level: "error",
			code: "DUPLICATE_SLUG",
			field: "slug",
			file,
			message: `${section === "glossary" ? "Glossary entry" : `${section[0].toUpperCase()}${section.slice(1)}`} slug "${slug}" is also used by ${relative(root, earlier)}; the site serves one page per slug, so one of them would not be published${section === "chapter" ? " (the PDF and EPUB would include both)" : ""}`,
			fix: "Give each its own slug (and update anything that links to the one you rename), or delete the duplicate.",
		});
	}
	return findings;
};

/**
 * A mechanism with no toolkit action leaves a reader who meets it nothing to
 * do about it; one with no example, no case to recognize it by. A warning in
 * a draft, which may still be writing them; an error once release rules apply.
 */
export const coverageFindings = (
	book: string,
	parsed: Record<ContentSection, ParsedSource[]>,
	releaseMode: boolean,
): BookFinding[] => {
	const bound = (section: ContentSection) =>
		new Set(
			parsed[section].flatMap(({ data }) =>
				typeof data?.mechanism === "string" && data.mechanism.trim()
					? [data.mechanism.trim()]
					: [],
			),
		);
	const tools = bound("tool");
	const examples = bound("example");
	const level = releaseMode ? "error" : "warning";
	return parsed.mechanism.flatMap(({ file, data }): BookFinding[] => {
		// A mechanism without a slug is already an error of its own.
		const slug = typeof data?.slug === "string" ? data.slug.trim() : "";
		if (!slug) return [];
		return [
			...(tools.has(slug)
				? []
				: [
						{
							level,
							code: "MECHANISM_NO_ACTION",
							field: "slug",
							file,
							message: `Mechanism "${slug}" has no toolkit action, so a reader who meets it has nothing to do about it`,
							fix: `Add one: bun run bookkit new tool ${book} ${slug} "<name>"`,
						} as const,
					]),
			...(examples.has(slug)
				? []
				: [
						{
							level,
							code: "MECHANISM_NO_EXAMPLE",
							field: "slug",
							file,
							message: `Mechanism "${slug}" has no example, so a reader has no case to recognize it by`,
							fix: `Add one: bun run bookkit new example ${book} ${slug} <domain> "<title>"`,
						} as const,
					]),
		];
	});
};

/** The book's release notes, as the release notes page would read them. */
export const releaseNoteFindings = (root: string): BookFinding[] =>
	listFiles(join(root, "releases")).flatMap((file) =>
		checkReleaseNote(readFileSync(file, "utf8")).map((finding) => ({
			...finding,
			file,
		})),
	);
