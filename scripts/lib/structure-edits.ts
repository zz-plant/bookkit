import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { listBookDirs, listFilesRecursive, repoRoot } from "../_lib";
import { withoutListItems } from "./chapter-prerequisites";
import { didYouMean } from "./cli";
import { MANIFEST_FILE } from "./import-markdown";
import { loadBookContent } from "./load-book";
import type { FileChange } from "./merge-mechanisms";

/**
 * `bookkit remove chapter|mechanism|tool` and `bookkit move tool`: the edits
 * an author made by hand, and finished by reading the next check's errors.
 * Each takes a record out with the references that would break (a chapter's
 * prerequisites, a mechanism's place in `mechanisms:` lists), and lists the
 * lines that still name it.
 */

export type StructurePlan =
	| {
			changes: FileChange[];
			notes: string[];
			leftovers: Array<{ path: string; line: number; text: string }>;
	  }
	| { error: string };

const escapeRegExp = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A tool by its slug or its file name (`<mechanism>--<slug>`). */
const findTool = (
	tools: ReturnType<typeof loadBookContent>["tools"],
	name: string,
) =>
	tools.find((tool) => tool.slug === name) ??
	tools.find(
		(tool) => tool.file && basename(tool.file).replace(/\.mdx?$/, "") === name,
	);

const contentDir = (book: string) =>
	join(repoRoot(), "apps", book, "src", "content", "book");

/** Every text file of the book's src/, with its text. */
const bookFiles = (book: string): Map<string, string> => {
	const src = join(repoRoot(), "apps", book, "src");
	return new Map(
		(existsSync(src) ? listFilesRecursive(src) : [])
			.filter((file) => /\.(mdx?|astro|[cm]?[jt]sx?|json)$/.test(file))
			.map((file) => [join(src, file), readFileSync(join(src, file), "utf8")]),
	);
};

/** Lines of `texts` that still name `slug`, for the author to read over. */
const leftoversOf = (
	texts: Map<string, string>,
	slug: string,
	removed: ReadonlySet<string>,
) => {
	const token = new RegExp(`(?<![a-z0-9-])${escapeRegExp(slug)}(?![a-z0-9-])`);
	return [...texts].flatMap(([file, text]) =>
		removed.has(file)
			? []
			: text.split("\n").flatMap((line, index) =>
					token.test(line)
						? [
								{
									path: relative(repoRoot(), file),
									line: index + 1,
									text: line.trim(),
								},
							]
						: [],
				),
	);
};

/** Edits for every changed text, then the removals. */
const changesFrom = (
	original: Map<string, string>,
	edited: Map<string, string>,
	removed: ReadonlySet<string>,
): FileChange[] => [
	...[...edited]
		.filter(([file, text]) => !removed.has(file) && original.get(file) !== text)
		.map(([path, text]) => ({ kind: "edit" as const, path, text })),
	...[...removed].map((path) => ({ kind: "remove" as const, path })),
];

export const planRemoveChapter = (
	book: string,
	slug: string,
): StructurePlan => {
	const content = loadBookContent(book);
	const chapter = content.chapters.find((entry) => entry.slug === slug);
	if (!chapter?.file) {
		return {
			error: `${book} has no chapter "${slug}".${didYouMean(
				slug,
				content.chapters.map((entry) => entry.slug),
			)}`,
		};
	}
	const original = bookFiles(book);
	const edited = new Map(original);
	const removed = new Set([chapter.file]);
	for (const other of content.chapters) {
		if (!other.file || other.file === chapter.file) continue;
		const text = edited.get(other.file);
		if (text !== undefined) {
			edited.set(other.file, withoutListItems(text, "prerequisites", [slug]));
		}
	}
	const manifest = join(contentDir(book), "chapters", MANIFEST_FILE);
	if (edited.has(manifest)) {
		const parsed = JSON.parse(edited.get(manifest) ?? "{}") as {
			chapters?: Array<{ file: string }>;
		};
		const name = basename(chapter.file);
		if (parsed.chapters?.some((entry) => entry.file === name)) {
			parsed.chapters = parsed.chapters.filter((entry) => entry.file !== name);
			edited.set(manifest, `${JSON.stringify(parsed, null, "\t")}\n`);
		}
	}
	return {
		changes: changesFrom(original, edited, removed),
		notes: [],
		leftovers: leftoversOf(edited, slug, removed),
	};
};

export const planRemoveTool = (book: string, slug: string): StructurePlan => {
	const content = loadBookContent(book);
	const tool = findTool(content.tools, slug);
	if (!tool?.file) {
		return {
			error: `${book} has no tool "${slug}".${didYouMean(
				slug,
				content.tools.map((entry) => entry.slug),
			)}`,
		};
	}
	const original = bookFiles(book);
	const removed = new Set([tool.file]);
	return {
		changes: changesFrom(original, original, removed),
		notes: [],
		leftovers: leftoversOf(original, tool.slug, removed),
	};
};

/**
 * A mechanism out of one book: its file, and its place in the `mechanisms:`
 * of chapters and glossary entries. Its tools and examples go too only with
 * `withRecords`; otherwise they are named, since they would bind to nothing.
 */
export const planRemoveMechanism = (
	book: string,
	slug: string,
	withRecords: boolean,
): StructurePlan => {
	const content = loadBookContent(book);
	const mechanism = content.mechanisms.find((entry) => entry.slug === slug);
	if (!mechanism?.file) {
		return {
			error: `${book} has no mechanism "${slug}".${didYouMean(
				slug,
				content.mechanisms.map((entry) => entry.slug),
			)}`,
		};
	}
	const tools = content.tools.filter((tool) => tool.mechanism === slug);
	const examplesDir = join(contentDir(book), "examples", slug);
	const examples = existsSync(examplesDir)
		? readdirSync(examplesDir)
				.filter((name) => /\.mdx?$/.test(name))
				.map((name) => join(examplesDir, name))
		: [];
	const bound = [
		...tools.flatMap((tool) => (tool.file ? [tool.file] : [])),
		...examples,
	];
	if (bound.length > 0 && !withRecords) {
		return {
			error: [
				`${slug} has ${tools.length} tool(s) and ${examples.length} example(s) bound to it, which would bind to nothing:`,
				...bound.map((file) => `  ${relative(repoRoot(), file)}`),
				`Bind the tools to another mechanism (bun run bookkit move tool ${book} <tool> --to <mechanism>), or pass --with-records to remove them too.`,
			].join("\n"),
		};
	}
	const original = bookFiles(book);
	const edited = new Map(original);
	const removed = new Set([mechanism.file, ...bound]);
	for (const [file, text] of edited) {
		if (removed.has(file) || !/\.mdx?$/.test(file)) continue;
		// Chapters' mechanisms, and the related mechanisms of glossary entries.
		edited.set(file, withoutListItems(text, "mechanisms", [slug]));
	}
	const elsewhere = loadBookHolders(slug).filter((other) => other !== book);
	return {
		changes: changesFrom(original, edited, removed),
		notes: elsewhere.length
			? [
					`${slug} stays in ${elsewhere.join(", ")}; this removes ${book}'s copy only.`,
				]
			: [],
		leftovers: leftoversOf(edited, slug, removed),
	};
};

/** The books that have a mechanism. */
const loadBookHolders = (slug: string): string[] =>
	listBookDirs().filter((book) =>
		loadBookContent(book).mechanisms.some((m) => m.slug === slug),
	);

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/** A tool bound to another mechanism: its `mechanism:`. Its slug and URL stay. */
export const planMoveTool = (
	book: string,
	slug: string,
	mechanism: string,
): StructurePlan => {
	const content = loadBookContent(book);
	const tool = findTool(content.tools, slug);
	if (!tool?.file) {
		return {
			error: `${book} has no tool "${slug}".${didYouMean(
				slug,
				content.tools.map((entry) => entry.slug),
			)}`,
		};
	}
	if (!content.mechanisms.some((entry) => entry.slug === mechanism)) {
		return {
			error: `${book} has no mechanism "${mechanism}".${didYouMean(
				mechanism,
				content.mechanisms.map((entry) => entry.slug),
			)}`,
		};
	}
	if (tool.mechanism === mechanism) {
		return { error: `${tool.slug} is already bound to ${mechanism}.` };
	}
	const text = readFileSync(tool.file, "utf8");
	const match = text.match(FRONTMATTER);
	if (!match || !/^mechanism:/m.test(match[1])) {
		return {
			error: `${relative(repoRoot(), tool.file)} has no mechanism: line to change.`,
		};
	}
	const front = match[1].replace(
		/^mechanism:[ \t]*(["']?)[^\n]*?\1[ \t]*$/m,
		(_line, quote) => `mechanism: ${quote}${mechanism}${quote}`,
	);
	return {
		changes: [
			{
				kind: "edit",
				path: tool.file,
				text: `${match[0].replace(match[1], () => front)}${text.slice(match[0].length)}`,
			},
		],
		notes: basename(tool.file).startsWith(`${tool.mechanism}--`)
			? [
					`Its file name, ${basename(tool.file)}, still begins with ${tool.mechanism}; its slug and URL stay as they are.`,
				]
			: [],
		leftovers: [],
	};
};
