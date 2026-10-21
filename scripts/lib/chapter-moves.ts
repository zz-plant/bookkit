import { existsSync, readFileSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";
import { listFilesRecursive, repoRoot, slugify } from "../_lib";
import { didYouMean } from "./cli";
import { MANIFEST_FILE } from "./import-markdown";
import { loadBookContent } from "./load-book";

/**
 * Chapter moves the author used to make by hand: a chapter between two
 * others (`new chapter --after`), and a chapter's slug changed everywhere it
 * is named (`rename chapter`). Reading order is the file names' order, so an
 * insert renumbers the files after it; slugs live in frontmatter and do not
 * change when a file is renumbered.
 */

/** One change to a file; `text` is absent for a rename that keeps the content. */
export type ChapterChange =
	| { kind: "edit"; path: string; text: string }
	| { kind: "move"; path: string; to: string; text?: string };

const escapeRegExp = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const chaptersDir = (book: string) =>
	join(repoRoot(), "apps", book, "src", "content", "book", "chapters");

/** The import manifest with chapter files renamed, if there is one. */
const manifestChange = (
	book: string,
	renames: ReadonlyMap<string, string>,
): ChapterChange[] => {
	const path = join(chaptersDir(book), MANIFEST_FILE);
	if (!existsSync(path) || renames.size === 0) return [];
	const manifest = JSON.parse(readFileSync(path, "utf8")) as {
		chapters?: Array<{ file: string }>;
	};
	let changed = false;
	for (const entry of manifest.chapters ?? []) {
		const to = renames.get(entry.file);
		if (to) {
			entry.file = to;
			changed = true;
		}
	}
	return changed
		? [
				{
					kind: "edit",
					path,
					text: `${JSON.stringify(manifest, null, "\t")}\n`,
				},
			]
		: [];
};

/**
 * Where a new chapter goes to come right after `after` (a chapter slug, file
 * name, or number: `3` or `03` for 03-*.mdx): its file name, and the files
 * after it renumbered to make room.
 */
export const planInsertAfter = (
	book: string,
	after: string,
	slug: string,
): { fileName: string; changes: ChapterChange[] } | { error: string } => {
	const content = loadBookContent(book);
	const target =
		content.chapters.find((chapter) => chapter.slug === after) ??
		content.chapters.find(
			(chapter) => chapter.file && basename(chapter.file) === after,
		) ??
		(/^\d+$/.test(after)
			? content.chapters.find(
					(chapter) =>
						chapter.file &&
						Number(basename(chapter.file).match(/^(\d+)-/)?.[1]) ===
							Number(after),
				)
			: undefined);
	if (!target?.file) {
		return {
			error: `${book} has no chapter "${after}".${didYouMean(
				after,
				content.chapters.map((chapter) => chapter.slug),
			)}`,
		};
	}
	const numbered = content.chapters
		.flatMap((chapter) => {
			const name = chapter.file ? basename(chapter.file) : "";
			const match = name.match(/^(\d+)-(.*)$/);
			return match ? [{ name, number: Number(match[1]), rest: match[2] }] : [];
		})
		.sort((a, b) => a.number - b.number || a.name.localeCompare(b.name));
	const afterName = basename(target.file);
	const afterNumber = Number(afterName.match(/^(\d+)-/)?.[1] ?? Number.NaN);
	if (Number.isNaN(afterNumber)) {
		return {
			error: `${afterName} has no number in its name, so there is no place after it to number. Name chapter files NN-<slug>.mdx.`,
		};
	}
	const width = Math.max(
		2,
		...numbered.map(({ name }) => name.match(/^(\d+)-/)?.[1].length ?? 2),
	);
	const later = numbered.filter(({ number }) => number > afterNumber);
	const next = later[0]?.number;
	// Room between this chapter and the next: use it, and rename nothing.
	if (next === undefined || next - afterNumber > 1) {
		const number =
			next === undefined
				? afterNumber + 1
				: afterNumber + Math.floor((next - afterNumber) / 2);
		return {
			fileName: `${String(number).padStart(width, "0")}-${slug}.mdx`,
			changes: [],
		};
	}
	// No room: every later file moves up by one.
	const renames = new Map<string, string>();
	for (const { name, number, rest } of later) {
		const to = `${String(number + 1).padStart(width, "0")}-${rest}`;
		if (to.match(/^(\d+)-/)?.[1].length !== width) {
			return {
				error: `Renumbering ${name} would need more than ${width} digits, which would sort it first. Renumber the chapters with wider numbers first.`,
			};
		}
		renames.set(name, to);
	}
	const dir = chaptersDir(book);
	// Last first, so no rename lands on a file not yet moved.
	const moves: ChapterChange[] = [...renames].reverse().map(([from, to]) => ({
		kind: "move",
		path: join(dir, from),
		to: join(dir, to),
	}));
	return {
		fileName: `${String(afterNumber + 1).padStart(width, "0")}-${slug}.mdx`,
		changes: [...moves, ...manifestChange(book, renames)],
	};
};

/** A frontmatter scalar set to `value`, keeping the line's quoting. */
const setScalar = (front: string, key: string, value: string): string =>
	front.replace(
		new RegExp(`^(${key}:[ \\t]*)(["']?)[^\\n]*?\\2([ \\t]*)$`, "m"),
		(_line, prefix, quote, space) =>
			`${prefix}${quote ? JSON.stringify(value) : value}${space}`,
	);

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/** `prerequisites:` items naming `from` renamed to `to`, block or one-line. */
const renamePrerequisite = (text: string, from: string, to: string): string => {
	const match = text.match(FRONTMATTER);
	if (!match) return text;
	let key = "";
	const lines = match[1].split("\n").map((line) => {
		const top = line.match(/^([A-Za-z_][\w-]*):(.*)$/);
		if (top) {
			key = top[1];
			if (key === "prerequisites" && /\[.*\]/.test(top[2])) {
				return line.replace(
					new RegExp(`(?<=[\\[,\\s"'])${escapeRegExp(from)}(?=["',\\]\\s])`),
					to,
				);
			}
			return line;
		}
		return key === "prerequisites"
			? line.replace(
					new RegExp(`^(\\s*-\\s+)(["']?)${escapeRegExp(from)}\\2\\s*$`),
					`$1$2${to}$2`,
				)
			: line;
	});
	return `${match[0].replace(match[1], () => lines.join("\n"))}${text.slice(match[0].length)}`;
};

/** Links to the chapter's page: /read/chapters/<slug>, and routes built in code. */
const renameLinks = (text: string, from: string, to: string): string =>
	text.replace(
		new RegExp(
			`(?<=chapters\\}?/)${escapeRegExp(from)}(?=[/#?)"'\`\\s\\]]|$)`,
			"gm",
		),
		to,
	);

/**
 * `rename chapter <from> <to>`: the chapter's slug, its file name when the
 * name carries the slug, other chapters' prerequisites, and links to it in
 * every file of the book's src/.
 */
export const planChapterRename = (
	book: string,
	from: string,
	toRaw: string,
	title?: string,
):
	| {
			to: string;
			changes: ChapterChange[];
			leftovers: Array<{ path: string; line: number; text: string }>;
	  }
	| { error: string } => {
	const to = slugify(toRaw);
	if (!to) return { error: `"${toRaw}" has no letters or digits for a slug.` };
	const content = loadBookContent(book);
	const chapter = content.chapters.find((entry) => entry.slug === from);
	if (!chapter?.file) {
		return {
			error: `${book} has no chapter "${from}".${didYouMean(
				from,
				content.chapters.map((entry) => entry.slug),
			)}`,
		};
	}
	if (from === to && !title) {
		return { error: `The chapter is already "${to}".` };
	}
	if (from !== to && content.chapters.some((entry) => entry.slug === to)) {
		return { error: `${book} already has a chapter "${to}".` };
	}
	const src = join(repoRoot(), "apps", book, "src");
	const files = listFilesRecursive(src)
		.filter((file) => /\.(mdx?|astro|[cm]?[jt]sx?)$/.test(file))
		.map((file) => join(src, file));
	const changes: ChapterChange[] = [];
	const renames = new Map<string, string>();
	const name = basename(chapter.file);
	const stem = name.slice(0, -extname(name).length);
	const renamedStem = stem.replace(
		new RegExp(`(^|-)${escapeRegExp(from)}$`),
		`$1${to}`,
	);
	const target =
		renamedStem !== stem
			? join(chaptersDir(book), `${renamedStem}${extname(name)}`)
			: chapter.file;
	if (target !== chapter.file && existsSync(target)) {
		return { error: `${relative(repoRoot(), target)} already exists.` };
	}
	if (target !== chapter.file) renames.set(name, basename(target));
	const finalTexts = new Map<string, string>();
	for (const file of files) {
		const original = readFileSync(file, "utf8");
		let text = original;
		if (file === chapter.file) {
			const match = text.match(FRONTMATTER);
			if (match) {
				let front = setScalar(match[1], "slug", to);
				if (title) front = setScalar(front, "title", title);
				text = `${match[0].replace(match[1], () => front)}${text.slice(match[0].length)}`;
			}
		}
		if (/\.mdx?$/.test(file)) text = renamePrerequisite(text, from, to);
		text = renameLinks(text, from, to);
		finalTexts.set(file, text);
		if (file === chapter.file && target !== chapter.file) {
			changes.push({ kind: "move", path: file, to: target, text });
		} else if (text !== original) {
			changes.push({ kind: "edit", path: file, text });
		}
	}
	changes.push(...manifestChange(book, renames));
	// Lines that still name the old slug, to read over.
	const token = new RegExp(`(?<![a-z0-9-])${escapeRegExp(from)}(?![a-z0-9-])`);
	const leftovers = [...finalTexts].flatMap(([file, text]) =>
		text.split("\n").flatMap((line, index) =>
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
	return { to, changes, leftovers };
};
