import { posix } from "node:path";
import { entryMarkdown } from "../../packages/astro-bookkit/src/exports/content-parsing";
import {
	dropMdxComments,
	replaceImages,
} from "../../packages/astro-bookkit/src/exports/markdown-blocks";
import { readLinkTarget } from "../../packages/astro-bookkit/src/exports/markdown-to-html";
import type {
	ExportEntry,
	ExportEntryKind,
	ExportPart,
} from "../../packages/astro-bookkit/src/exports/types";
import { formatFrontmatter } from "../../packages/astro-bookkit/src/utils/frontmatter";
import { HAS_SCHEME } from "../../packages/astro-bookkit/src/utils/links";
import {
	findUnsafeLinks,
	splitFencedCode,
	withoutUnsafeLinks,
} from "../../packages/astro-bookkit/src/utils/markdown";

/**
 * A book as a GitBook folder: one Markdown page per record, in the reading
 * order the PDF and EPUB use, and a SUMMARY.md that lists them. Pages are
 * written from the same records as those exports, so mechanisms and toolkit
 * actions carry their structured fields, not only their bodies.
 */

const FOLDERS: Record<ExportEntryKind, string> = {
	chapter: "chapters",
	mechanism: "mechanisms",
	tool: "toolkit",
	glossary: "glossary",
	example: "examples",
};

/** Where an entry's page goes, relative to the folder's root. */
export const gitbookPagePath = (entry: ExportEntry): string =>
	`${FOLDERS[entry.kind]}/${entry.slug}.md`;

export type GitbookOptions = {
	/** The book's public URL: links to its other pages point there. */
	siteUrl?: string;
	/**
	 * Copies a local image an entry shows into the folder and returns its
	 * path from the root, or returns null to leave the link as written.
	 */
	copyImage: (src: string, entry: ExportEntry) => string | null;
};

const INLINE_CODE = /(`+)[\s\S]*?\1/g;
// `](href "title")`: the target of an inline link or image.
const LINK_TARGET =
	/(\]\(\s*<?)([^)\s>]+)(>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\))/g;
// `[label]: href`: a reference definition.
const LINK_DEFINITION = /^(\s{0,3}\[[^\]]+\]:\s*<?)(\S+?)(>?(?:\s.*)?)$/gm;
const HREF_ATTRIBUTE = /(\shref\s*=\s*")([^"]*)(")/g;
const ESM_LINE = /^(?:import|export)\s/;
// MDX components are capitalized; HTML elements are not.
const COMPONENT_TAG = /<\/?[A-Z][\w.]*(?:\s[^<>]*)?\/?>/g;

/** `text` with `rewrite` applied outside inline code spans. */
const outsideCode = (text: string, rewrite: (prose: string) => string) => {
	let out = "";
	let at = 0;
	for (const match of text.matchAll(INLINE_CODE)) {
		out += rewrite(text.slice(at, match.index)) + match[0];
		at = (match.index ?? 0) + match[0].length;
	}
	return out + rewrite(text.slice(at));
};

/**
 * An entry's MDX body as GitBook Markdown: author comments, import and
 * export lines, and component tags (keeping what they wrap) are dropped;
 * links to read pages point at the folder's pages; local images are copied
 * in; other site links point at the site. Code blocks are left as written.
 * The site's link rule holds (`findUnsafeLinks`): a link to a `javascript:`,
 * `vbscript:`, or `data:` address keeps only its words, and an element loses
 * an unsafe address, an `<iframe srcdoc>`, or a spread attribute, so it
 * links to, loads, and submits to nothing.
 */
export const mdxToGitbookMarkdown = (
	entry: ExportEntry,
	pages: ReadonlyMap<string, string>,
	options: GitbookOptions,
): string => {
	const here = posix.dirname(gitbookPagePath(entry));
	const fromHere = (path: string) => posix.relative(here, path);
	const siteUrl = options.siteUrl?.trim().replace(/\/+$/, "");
	const href = (target: string) => {
		if (target.startsWith("#") || HAS_SCHEME.test(target)) return target;
		const record = readLinkTarget(target);
		const page = record && pages.get(`${record.kind}:${record.slug}`);
		if (record && page) {
			return `${fromHere(page)}${record.fragment ? `#${record.fragment}` : ""}`;
		}
		if (target.startsWith("/") && !target.startsWith("//") && siteUrl) {
			return `${siteUrl}${target}`;
		}
		return target;
	};
	const prose = (text: string) =>
		dropMdxComments(text)
			.split("\n")
			.filter((line) => !ESM_LINE.test(line))
			.join("\n")
			.replace(COMPONENT_TAG, "")
			.replace(
				LINK_DEFINITION,
				(_, start, target, end) => `${start}${href(target)}${end}`,
			)
			.split("\n")
			.map((line) =>
				outsideCode(line, (part) =>
					replaceImages(part, (image) => {
						const copied = options.copyImage(image.src, entry);
						return `![${image.alt}](${copied ? fromHere(copied) : image.src})`;
					})
						.replace(
							LINK_TARGET,
							(_, start, target, end) => `${start}${href(target)}${end}`,
						)
						.replace(
							HREF_ATTRIBUTE,
							(_, start, target, end) => `${start}${href(target)}${end}`,
						),
				),
			)
			.join("\n");
	const markdown = entryMarkdown(entry);
	return splitFencedCode(
		withoutUnsafeLinks(markdown, findUnsafeLinks(markdown)),
	)
		.map((segment) => (segment.code ? segment.text : prose(segment.text)))
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
};

/** One page: its description as GitBook frontmatter, its title, then its Markdown. */
export const gitbookPage = (entry: ExportEntry, markdown: string): string =>
	`${entry.description ? `${formatFrontmatter({ description: entry.description.replace(/\s+/g, " ").trim() })}\n` : ""}# ${entry.title}\n\n${markdown ? `${markdown}\n` : ""}`;

/** SUMMARY.md: the introduction, then each part as a group, with nested entries indented. */
export const gitbookSummary = (parts: ExportPart[]): string => {
	const lines = ["# Summary", "", "* [Introduction](README.md)"];
	const list = (entries: ExportEntry[], depth: number) => {
		for (const entry of entries) {
			lines.push(
				`${"  ".repeat(depth)}* [${entry.title.replace(/([[\]])/g, "\\$1")}](${gitbookPagePath(entry)})`,
			);
			list(entry.children ?? [], depth + 1);
		}
	};
	for (const part of parts) {
		lines.push("", `## ${part.title}`, "");
		list(part.entries, 0);
	}
	return `${lines.join("\n")}\n`;
};

/** Every entry, children after their parent. */
export const gitbookEntries = (parts: ExportPart[]): ExportEntry[] => {
	const all: ExportEntry[] = [];
	const add = (entry: ExportEntry) => {
		all.push(entry);
		for (const child of entry.children ?? []) add(child);
	};
	for (const part of parts) for (const entry of part.entries) add(entry);
	return all;
};
