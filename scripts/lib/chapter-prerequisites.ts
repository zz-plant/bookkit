import type { EdgeProposal } from "../../packages/astro-bookkit/src/proposals/types";
import { arrayValue, parseFrontmatter } from "./content-frontmatter";

/**
 * `bookkit propose --apply edges`: proposed prerequisite edges written into
 * the chapters' `prerequisites:`. The reading graph must stay acyclic, so an
 * edge that would close a loop is skipped and named, and when two chapters
 * would each require the other, the later chapter requires the earlier one.
 */

type Chapter = {
	slug: string;
	prerequisites: string[];
	order?: number;
	file?: string;
};

export type EdgePlan = {
	/** Prerequisites to add, per chapter slug, in the order they apply. */
	add: Map<string, string[]>;
	/** Edges not written, and why. */
	skipped: Array<{ edge: EdgeProposal; why: string }>;
};

/** Reading order: `order`, else the file name (chapters are numbered). */
const readingOrder = (chapters: readonly Chapter[]): string[] =>
	[...chapters]
		.sort(
			(a, b) =>
				(a.order ?? Number.POSITIVE_INFINITY) -
					(b.order ?? Number.POSITIVE_INFINITY) ||
				(a.file ?? a.slug).localeCompare(b.file ?? b.slug),
		)
		.map((chapter) => chapter.slug);

export const planEdges = (
	chapters: readonly Chapter[],
	edges: readonly EdgeProposal[],
): EdgePlan => {
	const prerequisites = new Map(
		chapters.map((chapter) => [chapter.slug, [...chapter.prerequisites]]),
	);
	const position = new Map(
		readingOrder(chapters).map((slug, index) => [slug, index]),
	);
	const at = (slug: string) => position.get(slug) ?? Number.POSITIVE_INFINITY;
	/** Whether `from` already needs `to`, directly or through others. */
	const needs = (from: string, to: string): boolean => {
		const seen = new Set<string>();
		const stack = [from];
		while (stack.length > 0) {
			const current = stack.pop() as string;
			if (current === to) return true;
			if (seen.has(current)) continue;
			seen.add(current);
			stack.push(...(prerequisites.get(current) ?? []));
		}
		return false;
	};
	// An edge from a later chapter to an earlier one first, so of two edges
	// that would make a loop, the one that follows reading order is kept.
	const ordered = [...edges].sort(
		(a, b) =>
			Number(at(a.introducedIn) > at(a.chapter)) -
				Number(at(b.introducedIn) > at(b.chapter)) ||
			at(a.chapter) - at(b.chapter),
	);
	const add = new Map<string, string[]>();
	const skipped: EdgePlan["skipped"] = [];
	for (const edge of ordered) {
		const list = prerequisites.get(edge.chapter);
		if (!list) {
			skipped.push({ edge, why: `no chapter "${edge.chapter}"` });
			continue;
		}
		if (list.includes(edge.introducedIn)) continue;
		if (needs(edge.introducedIn, edge.chapter)) {
			skipped.push({
				edge,
				why: `"${edge.introducedIn}" already requires "${edge.chapter}"; both ways would be a loop`,
			});
			continue;
		}
		list.push(edge.introducedIn);
		add.set(edge.chapter, [
			...(add.get(edge.chapter) ?? []),
			edge.introducedIn,
		]);
	}
	return { add, skipped };
};

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/**
 * A chapter file with `slugs` added to its `prerequisites:`, in the list's own
 * layout; a chapter without the list gets one, before `mechanisms:` when it
 * has that, as the books write it.
 */
export const withPrerequisites = (
	text: string,
	slugs: readonly string[],
): string => {
	const match = text.match(FRONTMATTER);
	if (!match) throw new Error("A chapter file without frontmatter.");
	const current = arrayValue(parseFrontmatter(text).data.prerequisites ?? null);
	const adding = slugs.filter((slug) => !current.includes(slug));
	if (adding.length === 0) return text;
	const lines = match[1].split("\n");
	const at = lines.findIndex((line) => /^prerequisites:/.test(line));
	if (at >= 0 && /\[.*\]/.test(lines[at])) {
		lines[at] = `prerequisites: [${[...current, ...adding].join(", ")}]`;
	} else if (at >= 0) {
		let end = at + 1;
		while (end < lines.length && /^\s+-\s/.test(lines[end])) end += 1;
		const indent = lines[at + 1]?.match(/^(\s+)-\s/)?.[1] ?? "  ";
		lines.splice(end, 0, ...adding.map((slug) => `${indent}- ${slug}`));
	} else {
		const before = lines.findIndex((line) => /^mechanisms:/.test(line));
		const block = ["prerequisites:", ...adding.map((slug) => `  - ${slug}`)];
		lines.splice(before >= 0 ? before : lines.length, 0, ...block);
	}
	const updated = `${match[0].replace(match[1], () => lines.join("\n"))}${text.slice(match[0].length)}`;
	const written = arrayValue(
		parseFrontmatter(updated).data.prerequisites ?? null,
	);
	if (!adding.every((slug) => written.includes(slug))) {
		throw new Error("Could not add the prerequisites to the chapter.");
	}
	return updated;
};
