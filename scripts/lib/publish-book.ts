import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "../../packages/astro-bookkit/src/utils/frontmatter";
import { extractBookStatusFromSource } from "../../packages/astro-bookkit/src/validators/frame-config";
import { listFilesRecursive, repoRoot } from "../_lib";

/**
 * `bookkit publish`: a book moved from draft to published, which an author
 * used to do by editing book.config.ts and finding out afterwards what the
 * release rules held it to.
 */

/**
 * book.config.ts with the book's own `status` set to `status`, or null when
 * it has none to change: the first `status:` at the shallowest indentation,
 * confirmed by reading the result back.
 */
export const withBookStatus = (
	source: string,
	status: string,
): string | null => {
	const lines = [
		...source.matchAll(/^([ \t]*)status:[ \t]*(["'])[^"'\n]*\2/gm),
	];
	if (lines.length === 0) return null;
	const depth = Math.min(...lines.map((match) => match[1].length));
	const own = lines.find((match) => match[1].length === depth);
	if (own?.index === undefined) return null;
	const next = `${source.slice(0, own.index)}${own[1]}status: ${own[2]}${status}${own[2]}${source.slice(own.index + own[0].length)}`;
	return extractBookStatusFromSource(next) === status ? next : null;
};

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/** A record's text with `status: published`, from draft or from no status. */
export const publishedRecord = (text: string): string => {
	const match = text.match(FRONTMATTER);
	if (!match) return text;
	const front = /^status:/m.test(match[1])
		? match[1].replace(
				/^status:[ \t]*(["']?)draft\1[ \t]*$/m,
				(_line, quote) => `status: ${quote}published${quote}`,
			)
		: `${match[1]}\nstatus: published`;
	return `${match[0].replace(match[1], () => front)}${text.slice(match[0].length)}`;
};

/** The book's content records that are drafts (status draft, or none), as absolute paths. */
export const draftRecords = (book: string): string[] => {
	const content = join(repoRoot(), "apps", book, "src", "content", "book");
	if (!existsSync(content)) return [];
	return listFilesRecursive(content)
		.filter((file) => /\.mdx?$/.test(file) && !file.startsWith("releases/"))
		.map((file) => join(content, file))
		.filter((path) => {
			const { status, data } = parseFrontmatter(readFileSync(path, "utf8"));
			return status === "ok" && (data.status ?? "draft") === "draft";
		});
};
