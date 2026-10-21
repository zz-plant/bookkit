import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, normalize, relative, sep } from "node:path";
import { parseFrontmatter } from "../../utils/frontmatter";
import {
	type ContentSection,
	SECTION_DIRECTORIES,
} from "../../validators/content-check";
import { bookArg, toSection } from "./book-arg";
import { handleCheckContent } from "./check_content";
import type { ToolHandler } from "./types";

/**
 * Writes one content file after check_content passes it: the step an agent
 * without file access could not take. The file goes where the book reads it
 * (a chapter after the last one, an example under its mechanism), and an
 * existing file is replaced only with `overwrite: true`.
 */

const toSlug = (raw: string): string =>
	raw
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "");

const contentFiles = (dir: string): string[] =>
	existsSync(dir)
		? readdirSync(dir, { recursive: true })
				.map((file) => String(file).split(sep).join("/"))
				.filter((file) => /\.mdx?$/.test(file))
		: [];

/** The next chapter file name: after the highest number, keeping the book's step (10s or 1s) and width. */
const nextChapterFile = (files: string[], slug: string): string => {
	const numbers = files
		.map((file) => file.match(/^(\d+)-/)?.[1])
		.filter((value): value is string => Boolean(value));
	const width = Math.max(2, ...numbers.map((value) => value.length));
	const values = numbers.map(Number);
	const highest = values.length > 0 ? Math.max(...values) : 0;
	const step =
		values.length > 1 && values.every((value) => value % 10 === 0) ? 10 : 1;
	const next = values.length > 0 ? highest + step : 1;
	return `${String(next).padStart(width, "0")}-${slug}.mdx`;
};

/** A file name given by the caller, inside the section folder; null when it would leave it. */
const safeFile = (file: string): string | null => {
	const cleaned = normalize(file.trim()).split(sep).join("/");
	if (
		!cleaned ||
		cleaned.startsWith("/") ||
		cleaned.split("/").includes("..") ||
		!/\.mdx?$/.test(cleaned)
	) {
		return null;
	}
	return cleaned;
};

const refuse = (summary: string, cause: string, nextAction: string) => ({
	ok: false,
	summary,
	error: { cause, nextAction, machineCode: "WRITE_CONTENT_REFUSED" },
});

export const handleWriteContent: ToolHandler = async ({ options, args }) => {
	const section = toSection(args?.section);
	const source = args?.source;
	const picked = bookArg(options, args);
	if (!picked.ok) return picked.response;
	const book = picked.book;
	if (!section || typeof source !== "string") {
		return refuse(
			"Pass section and source (the full file text, frontmatter included).",
			"invalid arguments",
			"Call again with section and source; bookkit.get_content_contract shows a valid file.",
		);
	}
	if (!book || !options.workspaceRoot) {
		return refuse(
			"This server has no book folder to write to.",
			"No workspace root or book slug.",
			"Run the server in a Bookkit workspace (bun run mcp), or write the file yourself.",
		);
	}

	// The same checks as check_content: nothing that would not compile is written.
	const checked = await handleCheckContent({ options, args });
	if (!checked.ok) {
		return {
			...checked,
			summary: `Not written. ${checked.summary}`,
		};
	}

	const { data } = parseFrontmatter(source);
	const slug =
		typeof data.slug === "string" && data.slug.trim()
			? data.slug.trim()
			: toSlug(typeof data.title === "string" ? data.title : "");
	const sectionDir = join(
		options.workspaceRoot,
		"apps",
		book,
		"src",
		"content",
		"book",
		SECTION_DIRECTORIES[section as ContentSection],
	);
	const existing = contentFiles(sectionDir);
	// The file that already serves this slug: its frontmatter slug, else its name.
	const sameSlug = existing.find((file) => {
		const own = parseFrontmatter(readFileSync(join(sectionDir, file), "utf8"))
			.data.slug;
		return (
			(typeof own === "string" && own.trim()
				? own.trim()
				: file
						.replace(/\.mdx?$/, "")
						.split("/")
						.pop()) === slug
		);
	});

	let file: string | null;
	if (typeof args?.file === "string" && args.file.trim()) {
		file = safeFile(args.file);
		if (!file) {
			return refuse(
				"Not written: file must be a .mdx or .md path inside the section folder.",
				`file=${JSON.stringify(args.file)} leaves ${SECTION_DIRECTORIES[section]}/ or is not .mdx/.md.`,
				"Pass a name such as 05-intro.mdx, or omit file to have one chosen.",
			);
		}
	} else if (sameSlug) {
		file = sameSlug;
	} else if (!slug) {
		return refuse(
			"Not written: the file has no slug or title to name it by.",
			"Missing slug and title.",
			"Add slug: (or title:) to the frontmatter, or pass file.",
		);
	} else if (section === "chapter") {
		file = nextChapterFile(existing, slug);
	} else if (section === "example") {
		const mechanism =
			typeof data.mechanism === "string" ? toSlug(data.mechanism) : "";
		file = mechanism ? `${mechanism}/${slug}.mdx` : `${slug}.mdx`;
	} else {
		file = `${slug}.mdx`;
	}

	const path = join(sectionDir, file);
	const shown = relative(options.workspaceRoot, path).split(sep).join("/");
	const replacing = existsSync(path);
	if (replacing && args?.overwrite !== true) {
		return refuse(
			`Not written: ${shown} already exists.`,
			sameSlug === file
				? `The book already has a ${section} "${slug}" in that file.`
				: "A file is already at that path.",
			"Read it with bookkit.read_book, then call again with overwrite: true to replace it, or pass another file.",
		);
	}
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, source.endsWith("\n") ? source : `${source}\n`);
	return {
		ok: true,
		summary: `${replacing ? "Replaced" : "Wrote"} ${shown}. ${checked.summary}`,
		payload: {
			...checked.payload,
			path: shown,
			replaced: replacing,
			next: "Call bookkit.validate_book to check the book with it in place.",
		},
	};
};
