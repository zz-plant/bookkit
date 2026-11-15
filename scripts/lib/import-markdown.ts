import { createHash } from "node:crypto";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, posix } from "node:path";
import {
	FRONTMATTER,
	formatFrontmatter,
	parseFrontmatter,
} from "../../packages/astro-bookkit/src/utils/frontmatter";
import {
	type MdxConversion,
	markupEntry,
	splitFencedCode,
	stripMarkdown,
	toMdxBody,
	type UnsafeMarkupEntry,
} from "../../packages/astro-bookkit/src/utils/markdown";
import { compileMdx, type MdxCompileResult } from "./compile-mdx";
import { INDEX_NAMES, importSkipReason } from "./import-rules";

/**
 * `bookkit import`: turns a folder of Markdown notes into a book's chapters.
 *
 * Exports from wikis, blogs, and note apps carry their own frontmatter, a
 * leading `# Title`, numbered file names, links between notes, images beside
 * them, folder READMEs, drafts, and text MDX cannot compile. Each note becomes
 * one chapter with the book's frontmatter; links between notes point at the
 * chapters, images are copied into the app's `public/images/`, and the body
 * is converted until it compiles as MDX the way the build compiles it.
 *
 * Planning reads and never writes, so `--dry-run` shows exactly what an
 * import would do. A manifest beside the chapters records which note each
 * chapter came from and a hash of what import wrote: a re-import updates
 * those chapters in place, appends new notes after the existing chapters,
 * and keeps any chapter edited since import unless `--force` is given.
 */

const NOTE_EXTENSION = /\.(md|mdx|markdown)$/i;
const IMAGE_EXTENSION = /\.(apng|avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i;
const DRAFT_FOLDER = /^_?drafts?$/i;
/** `01-`, `1.`, `02b-`, `010_`, or a Jekyll date `2024-03-01-` before a name. */
const ORDER_PREFIX = /^(?:\d{4}-\d{2}-\d{2}|(\d+)[a-z]?)[\s._-]+(?=\S)/;
const CHAPTER_STATUSES = new Set(["draft", "in-review", "published", "stable"]);
/** Source fields the chapter schema has a place for. */
const MAPPED_FIELDS = new Set([
	"title",
	"slug",
	"status",
	"draft",
	"published",
	"summary",
	"description",
	"subtitle",
	"excerpt",
]);

export const MANIFEST_FILE = "imported.json";

export type ImportOptions = {
	/** The workspace that holds `apps/<book>/`. */
	workspaceRoot: string;
	book: string;
	sourceDir: string;
	/** How to name the source folder in output; defaults to `sourceDir`. */
	sourceLabel?: string;
	/** Replace chapters and images edited since import (or never imported). */
	force?: boolean;
	/** Import README/index files as chapters instead of skipping them. */
	includeReadme?: boolean;
	/** Route notes marked by folder or frontmatter into mechanisms/toolkit/glossary/examples instead of chapters only. */
	classify?: boolean;
};

/**
 * - `new`: written with the next free number after the existing chapters
 * - `update`: rewritten in place; unchanged since import wrote it
 * - `unchanged`: what import would write is already there
 * - `keep`: edited since import, or not written by import; left alone
 * - `replace`: like `keep`, but `--force` rewrites it
 */
export type FileAction = "new" | "update" | "unchanged" | "keep" | "replace";

export type PlannedChapter = {
	/** Path of the note inside the source folder, with `/`. */
	source: string;
	/** File name in the book's `chapters/`. */
	file: string;
	slug: string;
	title: string;
	status: string;
	action: FileAction;
	/** Why: what makes it `keep` or `replace`, or where a `new` one goes. */
	reason?: string;
	content: string;
	changes: MdxConversion;
	/** Raw HTML is shown as text: kept as HTML, the chapter did not compile. */
	htmlAsText: boolean;
	/**
	 * What import left out: links kept as their text, since the site would
	 * not link them, and raw HTML the allowlist does not keep; `line` is in
	 * the note.
	 */
	unsafeMarkup: UnsafeMarkupEntry[];
	/** Source frontmatter fields the chapter schema has no place for. */
	leftOut: string[];
	compile: MdxCompileResult;
};

export type PlannedImage = {
	source: string;
	/** File name in the app's `public/images/`. */
	file: string;
	action: FileAction;
	reason?: string;
};

export type ImportProblem = { source: string; line?: number; message: string };

export type PlannedRecord = {
	source: string;
	section: "mechanism" | "tool" | "example" | "glossary";
	/** Relative to `src/content/book/`, e.g. `mechanisms/queue-backpressure.mdx`. */
	file: string;
	slug: string;
	title: string;
	status: string;
	action: FileAction;
	reason?: string;
	content: string;
	compile: MdxCompileResult;
};

export type ImportPlan = {
	book: string;
	sourceDir: string;
	sourceLabel: string;
	/** `apps/<book>`, absolute. */
	appDir: string;
	/** `apps/<book>/src/content/book/chapters`, absolute. */
	chaptersDir: string;
	/** `apps/<book>/public/images`, absolute. */
	imagesDir: string;
	chapters: PlannedChapter[];
	records: PlannedRecord[];
	images: PlannedImage[];
	skipped: Array<{ source: string; reason: string }>;
	links: Array<{ source: string; line: number; from: string; to: string }>;
	/** Chapters an earlier import wrote whose note is no longer in the folder. */
	orphans: Array<{ file: string; source: string }>;
	problems: ImportProblem[];
	manifest: ImportManifest;
};

type ManifestEntry = { source: string; file: string; sha256: string };

export type ImportManifest = {
	about: string;
	chapters: ManifestEntry[];
	images: ManifestEntry[];
};

const MANIFEST_ABOUT =
	"Written by bookkit import: the note each chapter and image came from, and a hash of what import wrote. A re-import updates these in place; a file whose hash no longer matches was edited after import and is kept unless --force is given.";

const sha256 = (content: string | Uint8Array) =>
	createHash("sha256").update(content).digest("hex");

const text = (value: unknown): string | undefined =>
	typeof value === "string" && value.trim() ? value.trim() : undefined;

const slugify = (value: string): string =>
	value
		.normalize("NFKD")
		// Accents go: "Café" becomes "cafe", not "caf".
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

/** Strips trailing Notion export UUIDs (` <32hex>`, `-<32hex>`, or hyphenated UUID). */
export const stripNotionId = (value: string): string => {
	const cleaned = value.replace(
		/(?:[\s-]+(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))$/i,
		"",
	);
	return cleaned.trim() ? cleaned : value;
};

const stem = (path: string) => posix.basename(path).replace(NOTE_EXTENSION, "");

/** The file name without an ordering prefix, and the prefix's number. */
const splitOrder = (name: string): { order?: number; name: string } => {
	const clean = stripNotionId(name);
	const match = clean.match(ORDER_PREFIX);
	if (!match) return { name: clean };
	return {
		order: match[1] === undefined ? undefined : Number(match[1]),
		name: clean.slice(match[0].length),
	};
};

const titleFromFileName = (path: string): string => {
	const base = splitOrder(stem(path)).name.replace(/[-_]+/g, " ").trim();
	return base.charAt(0).toUpperCase() + base.slice(1);
};

/** Converts Docusaurus/MkDocs `:::type[Title]` admonitions outside fenced code to blockquotes. */
export const convertAdmonitions = (body: string): string =>
	splitFencedCode(body)
		.map((segment) => {
			if (segment.code) return segment.text;
			return segment.text.replace(
				/^:::[ \t]*([A-Za-z][A-Za-z0-9_-]*)(?:\[([^\]]+)\]|[ \t]+([^\n]+))?[ \t]*\n([\s\S]*?)^:::[ \t]*$/gm,
				(
					_,
					kind: string,
					bracketTitle?: string,
					inlineTitle?: string,
					inner = "",
				) => {
					const label = (bracketTitle ?? inlineTitle ?? "").trim();
					const heading =
						label || kind.charAt(0).toUpperCase() + kind.slice(1).toLowerCase();
					const bodyLines = inner.replace(/\n$/, "").split("\n");
					const quoted = bodyLines.map((line: string) =>
						line.trim() ? `> ${line}` : ">",
					);
					return [`> **${heading}**`, ...quoted].join("\n");
				},
			);
		})
		.join("\n");

/** Reads Docusaurus `_category_.json` positions per folder for ordering hints. */
const readCategoryPositions = (sourceDir: string): Map<string, number> => {
	const positions = new Map<string, number>();
	const walk = (rel: string) => {
		const full = rel ? join(sourceDir, rel) : sourceDir;
		const category = join(full, "_category_.json");
		if (rel && existsSync(category)) {
			try {
				const parsed = JSON.parse(readFileSync(category, "utf8")) as {
					position?: unknown;
				};
				if (typeof parsed.position === "number") {
					positions.set(rel, parsed.position);
				}
			} catch {
				// Ignore unreadable _category_.json.
			}
		}
		for (const entry of readdirSync(full, { withFileTypes: true })) {
			if (
				!entry.isDirectory() ||
				entry.name.startsWith(".") ||
				entry.name === "node_modules"
			) {
				continue;
			}
			walk(rel ? `${rel}/${entry.name}` : entry.name);
		}
	};
	walk("");
	return positions;
};

/** Compares paths folder by folder, honoring `_category_.json` positions and numbers by value. */
const comparePaths = (
	a: string,
	b: string,
	positions: Map<string, number> = new Map(),
): number => {
	const left = a.split("/");
	const right = b.split("/");
	let prefix = "";
	for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
		if (left[i] !== right[i]) {
			const leftIsDir = i < left.length - 1;
			const rightIsDir = i < right.length - 1;
			if (leftIsDir && rightIsDir) {
				const lp = positions.get(prefix ? `${prefix}/${left[i]}` : left[i]);
				const rp = positions.get(prefix ? `${prefix}/${right[i]}` : right[i]);
				if (lp !== undefined && rp !== undefined && lp !== rp) return lp - rp;
				if (lp !== undefined && rp === undefined) return -1;
				if (lp === undefined && rp !== undefined) return 1;
			}
			return left[i].localeCompare(right[i], "en", { numeric: true });
		}
		prefix = prefix ? `${prefix}/${left[i]}` : left[i];
	}
	return left.length - right.length;
};

const listNotes = (root: string, dir = ""): string[] =>
	readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
		if (entry.name.startsWith(".") || entry.name === "node_modules") return [];
		const path = dir ? `${dir}/${entry.name}` : entry.name;
		if (entry.isDirectory()) return listNotes(root, path);
		return entry.isFile() && NOTE_EXTENSION.test(entry.name) ? [path] : [];
	});

const lineCount = (value: string) => value.match(/\n/g)?.length ?? 0;

/** Replaces inline code with filler of the same length, so offsets still match. */
const maskInlineCode = (prose: string) =>
	prose.replace(/(`+)[\s\S]*?\1/g, (code) => "\0".repeat(code.length));

// `](destination "title")`, the part of an inline link or image import rewrites.
const INLINE_DESTINATION =
	/\]\(\s*(<[^<>\n]*>|[^\s()<>]+(?:\([^\s()<>]*\)[^\s()<>]*)*)/g;
// `[label]: destination` at the start of a line; `[^1]:` is a footnote.
const REFERENCE_DESTINATION =
	/^ {0,3}\[(?!\^)[^\]\n]+\]:[ \t]*(<[^<>\n]*>|\S+)/gm;
// `[[Note]]`, `[[Note#Heading|text]]`, and `![[image.png]]`: links as
// Obsidian and other wikis write them.
const WIKI_LINK =
	/(!?)\[\[([^[\]\n|#]*)(?:#([^[\]\n|]*))?(?:\|([^[\]\n]*))?\]\]/g;
// `href=` or `src=` inside a raw HTML tag.
const HTML_DESTINATION =
	/<[A-Za-z][^<>]*?\s(?:href|src)\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+)/g;

export type NoteSection =
	| "chapter"
	| "mechanism"
	| "tool"
	| "example"
	| "glossary";

const SECTION_DIRS: Record<NoteSection, string> = {
	chapter: "chapters",
	mechanism: "mechanisms",
	tool: "toolkit",
	example: "examples",
	glossary: "glossary",
};

const classifySection = (
	source: string,
	data: Record<string, unknown>,
	classify: boolean,
): NoteSection => {
	if (!classify) return "chapter";
	const raw = (
		text(data.type) ??
		text(data.kind) ??
		text(data.section) ??
		""
	).toLowerCase();
	if (raw === "mechanism" || raw === "mechanisms") return "mechanism";
	if (raw === "tool" || raw === "toolkit" || raw === "runbook") return "tool";
	if (raw === "example" || raw === "examples") return "example";
	if (raw === "glossary" || raw === "term" || raw === "terms")
		return "glossary";
	const top = splitOrder(source.split("/")[0] ?? "").name.toLowerCase();
	if (top === "mechanisms" || top === "mechanism") return "mechanism";
	if (top === "toolkit" || top === "tools" || top === "runbooks") return "tool";
	if (top === "examples" || top === "example") return "example";
	if (top === "glossary" || top === "terms") return "glossary";
	return "chapter";
};

const stringList = (value: unknown): string[] | undefined => {
	if (!Array.isArray(value)) return undefined;
	const items = value
		.filter(
			(item): item is string =>
				typeof item === "string" && item.trim().length > 0,
		)
		.map((item) => item.trim());
	return items.length > 0 ? items : undefined;
};

type Note = {
	source: string;
	section: NoteSection;
	data: Record<string, unknown>;
	/** Frontmatter that did not parse, and why. */
	invalid?: { yaml: string; reason: string };
	body: string;
	/** Lines before `body` in the source file. */
	bodyLine: number;
	slug: string;
	title: string;
	/** The leading `# Title` is the title, so it is left out of the body. */
	dropLeadingHeading: boolean;
	status: string;
};

/** The first level-1 heading outside code, and whether it opens the body. */
const firstHeading = (
	body: string,
): { text: string; leading: boolean; length: number } | undefined => {
	const lines = body.split("\n");
	for (const segment of splitFencedCode(body)) {
		if (segment.code) continue;
		const match = segment.text.match(
			/^ {0,3}#[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$|^([^\n]+)\n=+[ \t]*$/m,
		);
		if (!match) continue;
		const offset = lines
			.slice(0, segment.line)
			.reduce((sum, line) => sum + line.length + 1, 0);
		const index = offset + (match.index ?? 0);
		return {
			text: stripMarkdown(match[1] ?? match[2]).trim(),
			leading: body.slice(0, index).trim() === "",
			length: index + match[0].length,
		};
	}
	return undefined;
};

const readNote = (
	sourceDir: string,
	source: string,
	classify = false,
): Note => {
	const raw = readFileSync(join(sourceDir, source), "utf8").replace(
		/\r\n/g,
		"\n",
	);
	const parsed = parseFrontmatter(raw);
	const block =
		parsed.status === "missing" ? "" : (raw.match(FRONTMATTER)?.[0] ?? "");
	const rest = raw.slice(block.length);
	const blank = rest.match(/^\s*\n/)?.[0] ?? "";
	const body = convertAdmonitions(rest.slice(blank.length).trimEnd());
	const data = parsed.status === "ok" ? parsed.data : {};
	const section = classifySection(source, data, classify);
	const segments = source.split("/");
	const name = stem(source);
	const { order, name: baseName } = splitOrder(name);
	// A folder's README or index is named for the folder.
	const folder =
		INDEX_NAMES.has(stripNotionId(name).toLowerCase()) && segments.length > 1
			? segments[segments.length - 2]
			: undefined;

	const heading = firstHeading(body);
	const fromSource = text(data.title);
	const dropLeadingHeading = Boolean(
		heading?.leading && (!fromSource || fromSource === heading.text),
	);
	let title =
		fromSource ?? heading?.text ?? titleFromFileName(folder ?? source);
	// "01 Why handoffs fail" in 01-why-handoffs-fail.md: the number is order.
	if (order !== undefined) {
		const numbered = title.match(/^0*(\d+)[\s.):_-]+(?=\S)/);
		if (numbered && Number(numbered[1]) === order) {
			title = title.slice(numbered[0].length);
		}
	}

	const draft =
		segments.slice(0, -1).some((folder) => DRAFT_FOLDER.test(folder)) ||
		data.draft === true ||
		data.draft === "true" ||
		data.published === false ||
		data.published === "false";
	const status = draft
		? "draft"
		: typeof data.status === "string" && CHAPTER_STATUSES.has(data.status)
			? data.status
			: "published";

	const declaredSlug = text(data.slug);
	const slug =
		(declaredSlug && /^[a-z0-9-]+$/.test(declaredSlug) && declaredSlug) ||
		slugify(
			folder
				? splitOrder(folder).name
				: INDEX_NAMES.has(name.toLowerCase())
					? title
					: baseName,
		) ||
		slugify(title) ||
		"chapter";

	return {
		source,
		section,
		data,
		invalid:
			parsed.status === "invalid"
				? { yaml: block, reason: parsed.reason }
				: undefined,
		body,
		bodyLine: lineCount(block) + lineCount(blank),
		slug,
		title,
		dropLeadingHeading,
		status,
	};
};

/** Gives each imported note a slug no other imported note uses. */
const assignUniqueSlugs = (notes: Note[]): void => {
	const taken = new Map<string, number>();
	for (const note of notes)
		taken.set(note.slug, (taken.get(note.slug) ?? 0) + 1);
	const used = new Set<string>();
	for (const note of notes) {
		let slug = note.slug;
		if ((taken.get(slug) ?? 0) > 1) {
			const folder = slugify(posix.dirname(note.source).replace(/\//g, "-"));
			if (folder && folder !== ".") slug = `${folder}-${slug}`;
		}
		let candidate = slug;
		for (let n = 2; used.has(candidate); n += 1) candidate = `${slug}-${n}`;
		used.add(candidate);
		note.slug = candidate;
	}
};

const readManifest = (chaptersDir: string): ImportManifest => {
	const path = join(chaptersDir, MANIFEST_FILE);
	const empty = { about: MANIFEST_ABOUT, chapters: [], images: [] };
	if (!existsSync(path)) return empty;
	try {
		const data = JSON.parse(readFileSync(path, "utf8"));
		const entries = (value: unknown): ManifestEntry[] =>
			Array.isArray(value)
				? value.filter(
						(entry): entry is ManifestEntry =>
							typeof entry?.source === "string" &&
							typeof entry?.file === "string" &&
							typeof entry?.sha256 === "string",
					)
				: [];
		return {
			about: MANIFEST_ABOUT,
			chapters: entries(data.chapters),
			images: entries(data.images),
		};
	} catch {
		return empty;
	}
};

/** What to do with a file import wants to write over an existing one. */
const decide = (
	current: string | Uint8Array,
	next: string | Uint8Array,
	recorded: ManifestEntry | undefined,
	force: boolean,
	label: string,
): { action: FileAction; reason?: string } => {
	if (sha256(current) === sha256(next)) return { action: "unchanged" };
	if (recorded && recorded.sha256 === sha256(current))
		return { action: "update" };
	const reason = recorded
		? `edited since import`
		: `${label} exists and import has no record of writing it`;
	return force ? { action: "replace", reason } : { action: "keep", reason };
};

export const planImport = async (
	options: ImportOptions,
): Promise<ImportPlan> => {
	const { workspaceRoot, book, sourceDir } = options;
	const force = options.force ?? false;
	const appDir = join(workspaceRoot, "apps", book);
	const chaptersDir = join(appDir, "src", "content", "book", "chapters");
	const imagesDir = join(appDir, "public", "images");
	const manifest = readManifest(chaptersDir);
	const problems: ImportProblem[] = [];
	const skipped: ImportPlan["skipped"] = [];

	const notes: Note[] = [];
	const positions = readCategoryPositions(sourceDir);
	for (const source of listNotes(sourceDir).sort((a, b) =>
		comparePaths(a, b, positions),
	)) {
		const reason = importSkipReason(source, options.includeReadme);
		if (reason) skipped.push({ source, reason });
		else notes.push(readNote(sourceDir, source, options.classify ?? false));
	}
	assignUniqueSlugs(notes);
	const noteBySource = new Map(notes.map((note) => [note.source, note]));
	const skippedBySource = new Map(skipped.map((s) => [s.source, s.reason]));

	// Images keep the name an earlier import gave them; new ones get a free one.
	const images: PlannedImage[] = [];
	const imageBySource = new Map<string, PlannedImage>();
	const imageNames = new Set(manifest.images.map((entry) => entry.file));
	const imageFor = (source: string): string => {
		const known = imageBySource.get(source);
		if (known) return known.file;
		const recorded = manifest.images.find((entry) => entry.source === source);
		let file = recorded?.file;
		if (!file) {
			const extension = posix.extname(source).toLowerCase();
			const base = slugify(posix.basename(source, posix.extname(source)));
			const folder = slugify(posix.dirname(source).replace(/\//g, "-"));
			file = `${base || "image"}${extension}`;
			if (imageNames.has(file) && folder) file = `${folder}-${file}`;
			for (let n = 2; imageNames.has(file); n += 1) {
				file = `${base || "image"}-${n}${extension}`;
			}
			imageNames.add(file);
		}
		const bytes = readFileSync(join(sourceDir, source));
		const target = join(imagesDir, file);
		const { action, reason } = existsSync(target)
			? decide(
					readFileSync(target),
					bytes,
					recorded,
					force,
					`public/images/${file}`,
				)
			: { action: "new" as const, reason: undefined };
		const image = { source, file, action, reason };
		images.push(image);
		imageBySource.set(source, image);
		return file;
	};

	const links: ImportPlan["links"] = [];
	/** The destination a link in `note` should have, or undefined to leave it. */
	const rewrite = (
		note: Note,
		destination: string,
		line: number,
	): string | undefined => {
		const url = destination.startsWith("<")
			? destination.slice(1, -1)
			: destination;
		// Fragments, other sites, mail, and site-absolute paths stay as written.
		if (!url || /^(#|\/|[a-z][a-z0-9+.-]*:)/i.test(url)) return undefined;
		const [pathAndQuery, hash] = url.split("#", 2);
		const path = pathAndQuery.split("?")[0];
		let decoded = path;
		try {
			decoded = decodeURIComponent(path);
		} catch {}
		const target = posix.normalize(
			posix.join(posix.dirname(note.source), decoded),
		);
		const problem = (message: string) => {
			problems.push({ source: note.source, line, message });
			return undefined;
		};
		if (target === ".." || target.startsWith("../")) {
			return problem(`links to ${url}, outside the imported folder`);
		}
		const candidates = [
			target,
			`${target}.md`,
			`${target}.mdx`,
			`${target}/README.md`,
			`${target}/index.md`,
		];
		const linked = candidates
			.map((candidate) => noteBySource.get(candidate))
			.find(Boolean);
		if (linked) {
			const to = `/read/${SECTION_DIRS[linked.section]}/${linked.slug}${hash ? `#${hash}` : ""}`;
			links.push({ source: note.source, line, from: url, to });
			return to;
		}
		const skippedReason = candidates
			.map((candidate) => skippedBySource.get(candidate))
			.find(Boolean);
		if (skippedReason) {
			return problem(
				`links to ${target}, which is not imported (${skippedReason.split(";")[0]})`,
			);
		}
		const file = join(sourceDir, target);
		const isFile = existsSync(file) && statSync(file).isFile();
		if (isFile && IMAGE_EXTENSION.test(target)) {
			return `/images/${imageFor(target)}`;
		}
		if (isFile) {
			return problem(
				`links to ${target}, which is not a note or an image, so it is not in the book`,
			);
		}
		return problem(
			IMAGE_EXTENSION.test(target)
				? `shows the image ${target}, which does not exist`
				: `links to ${target}, which does not exist`,
		);
	};

	// Wiki links name a note by its file name (any folder) or its title.
	const noteByName = new Map<string, Note>();
	for (const note of notes) {
		const baseNoExt = posix.basename(note.source).replace(/\.mdx?$/i, "");
		for (const key of [
			note.source.replace(/\.mdx?$/i, ""),
			baseNoExt,
			stripNotionId(baseNoExt),
			note.title,
		]) {
			const name = key.trim().toLowerCase();
			if (name && !noteByName.has(name)) noteByName.set(name, note);
		}
	}
	// Wiki embeds name an image by its file name alone.
	let filesByName: Map<string, string> | undefined;
	const fileNamed = (name: string): string | undefined => {
		if (!filesByName) {
			filesByName = new Map();
			const walk = (dir: string) => {
				for (const entry of readdirSync(join(sourceDir, dir), {
					withFileTypes: true,
				})) {
					if (entry.name.startsWith(".") || entry.name === "node_modules")
						continue;
					const path = dir ? `${dir}/${entry.name}` : entry.name;
					if (entry.isDirectory()) walk(path);
					else if (!filesByName?.has(entry.name.toLowerCase())) {
						filesByName?.set(entry.name.toLowerCase(), path);
					}
				}
			};
			walk("");
		}
		return (
			filesByName.get(name.trim().toLowerCase()) ??
			filesByName.get(posix.basename(name.trim()).toLowerCase())
		);
	};
	const anchor = (heading: string) =>
		heading
			.trim()
			.toLowerCase()
			.replace(/[^\p{L}\p{N}\s-]/gu, "")
			.replace(/\s+/g, "-");

	/** `[[…]]` links and `![[…]]` embeds as Markdown, or their text when nothing matches. */
	const rewriteWikiLinks = (
		note: Note,
		prose: string,
		lineOf: (offset: number) => number,
	): string => {
		const masked = maskInlineCode(prose);
		if (!masked.includes("[[")) return prose;
		let out = "";
		let last = 0;
		for (const match of masked.matchAll(WIKI_LINK)) {
			const start = match.index ?? 0;
			const whole = prose.slice(start, start + match[0].length);
			const [, bang, rawTarget = "", rawHeading, rawText] =
				whole.match(new RegExp(WIKI_LINK.source)) ?? [];
			const target = rawTarget.trim();
			const heading = rawHeading?.trim();
			const line = lineOf(start);
			const isImage = Boolean(bang) && IMAGE_EXTENSION.test(target);
			const imageFile = isImage ? fileNamed(target) : undefined;
			const linked = isImage ? undefined : noteByName.get(target.toLowerCase());
			const text =
				rawText?.trim() ||
				(heading && target ? `${target} › ${heading}` : target);
			let next: string;
			if (imageFile) {
				const alt = posix
					.basename(imageFile, posix.extname(imageFile))
					.replace(/[-_]+/g, " ");
				next = `![${alt}](/images/${imageFor(imageFile)})`;
			} else if (!target && heading) {
				next = `[${rawText?.trim() || heading}](#${anchor(heading)})`;
			} else if (linked) {
				const to = `/read/${SECTION_DIRS[linked.section]}/${linked.slug}${heading ? `#${anchor(heading)}` : ""}`;
				links.push({ source: note.source, line, from: whole, to });
				if (bang) {
					problems.push({
						source: note.source,
						line,
						message: `embeds ${whole}; a chapter cannot hold another, so it links to it instead`,
					});
				}
				next = `[${text}](${to})`;
			} else {
				problems.push({
					source: note.source,
					line,
					message: bang
						? `embeds ${whole}, which is not in the folder; left out`
						: `links to ${whole}, which no imported note is named; kept as its text`,
				});
				next = bang ? "" : text;
			}
			out += prose.slice(last, start) + next;
			last = start + match[0].length;
		}
		return out + prose.slice(last);
	};

	const rewriteLinks = (note: Note, body: string): string =>
		splitFencedCode(body)
			.map((segment) => {
				if (segment.code) return segment.text;
				let prose = rewriteWikiLinks(
					note,
					segment.text,
					(offset) =>
						note.bodyLine +
						segment.line +
						lineCount(segment.text.slice(0, offset)) +
						1,
				);
				for (const pattern of [
					INLINE_DESTINATION,
					REFERENCE_DESTINATION,
					HTML_DESTINATION,
				]) {
					const masked = maskInlineCode(prose);
					let out = "";
					let last = 0;
					for (const match of masked.matchAll(pattern)) {
						const quoted = match[1];
						const start = (match.index ?? 0) + match[0].length - quoted.length;
						const raw = prose.slice(start, start + quoted.length);
						const quote = /^["']/.test(raw) ? raw[0] : "";
						const line =
							note.bodyLine +
							segment.line +
							lineCount(prose.slice(0, start)) +
							1;
						const next = rewrite(note, quote ? raw.slice(1, -1) : raw, line);
						if (next === undefined) continue;
						out += prose.slice(last, start) + quote + next + quote;
						last = start + quoted.length;
					}
					prose = out + prose.slice(last);
				}
				return prose;
			})
			.join("\n");

	// Existing chapters, by file and by slug, and the next free number.
	const existing = existsSync(chaptersDir)
		? readdirSync(chaptersDir).filter((file) => file.endsWith(".mdx"))
		: [];
	const slugOf = (file: string) => {
		const parsed = parseFrontmatter(
			readFileSync(join(chaptersDir, file), "utf8"),
		);
		return text(parsed.data.slug) ?? file.replace(/\.mdx$/, "");
	};
	const fileBySlug = new Map(existing.map((file) => [slugOf(file), file]));
	let next =
		Math.max(
			0,
			...existing.map((file) => Number(file.match(/^(\d+)-/)?.[1] ?? 0)),
		) + 1;
	const width = Math.max(
		2,
		String(next + notes.length).length,
		...existing.map((file) => file.match(/^(\d+)-/)?.[1].length ?? 0),
	);

	const chapterNotes = notes.filter((note) => note.section === "chapter");
	const recordNotes = notes.filter((note) => note.section !== "chapter");
	const firstMechanismSlug =
		recordNotes.find((note) => note.section === "mechanism")?.slug ??
		"draft-mechanism";

	const chapters: PlannedChapter[] = [];
	const matched = new Set<string>();
	for (const note of chapterNotes) {
		let body = rewriteLinks(note, note.body);
		// The note's lines before the converted body, so a line in it names the note's.
		let linesBefore = note.bodyLine;
		if (note.dropLeadingHeading) {
			const heading = firstHeading(body);
			if (heading?.leading) {
				const rest = body.slice(heading.length);
				const kept = rest.trim();
				linesBefore += lineCount(
					body.slice(0, heading.length + rest.indexOf(kept)),
				);
				body = kept;
			}
		}
		if (note.invalid) {
			problems.push({
				source: note.source,
				line: 1,
				message: `frontmatter does not parse (${note.invalid.reason}); kept in the chapter as an MDX comment`,
			});
			// An HTML comment, which the MDX conversion turns into an MDX comment.
			const comment = `<!--\n${note.invalid.yaml.replace(/-->/g, "-- >").trim()}\n-->\n\n`;
			linesBefore -= lineCount(comment);
			body = `${comment}${body}`;
		}
		const summary =
			text(note.data.summary) ??
			text(note.data.description) ??
			text(note.data.subtitle) ??
			text(note.data.excerpt);
		const frontmatter = formatFrontmatter({
			slug: note.slug,
			status: note.status,
			title: note.title,
			...(summary ? { summary } : {}),
		});

		// Keep raw HTML as HTML when MDX compiles it; otherwise show it as text.
		let converted = toMdxBody(body, { html: "jsx" });
		let content = `${frontmatter}\n${converted.body}\n`;
		let compiled = await compileMdx(content, appDir);
		let htmlAsText = false;
		if (compiled.ok === false && converted.changes.html > 0) {
			const escaped = toMdxBody(body);
			const escapedContent = `${frontmatter}\n${escaped.body}\n`;
			const retry = await compileMdx(escapedContent, appDir);
			if (retry.ok !== false) {
				converted = escaped;
				content = escapedContent;
				compiled = retry;
				htmlAsText = true;
			}
		}

		// Match an earlier import of this note by source, then by slug.
		const recorded = manifest.chapters.find(
			(entry) =>
				entry.source === note.source &&
				existsSync(join(chaptersDir, entry.file)),
		);
		const file = recorded?.file ?? fileBySlug.get(note.slug);
		if (file && matched.has(file)) {
			problems.push({
				source: note.source,
				message: `its slug "${note.slug}" belongs to chapters/${file}, which another note updates; set a different slug in the note's frontmatter`,
			});
			continue;
		}
		let action: FileAction = "new";
		let reason: string | undefined;
		let target: string;
		if (file) {
			target = file;
			matched.add(file);
			const byFile = manifest.chapters.find((entry) => entry.file === file);
			({ action, reason } = decide(
				readFileSync(join(chaptersDir, file), "utf8"),
				content,
				byFile,
				force,
				`chapters/${file}`,
			));
		} else {
			target = `${String(next).padStart(width, "0")}-${note.slug}.mdx`;
			next += 1;
		}

		chapters.push({
			source: note.source,
			file: target,
			slug: note.slug,
			title: note.title,
			status: note.status,
			action,
			reason,
			content,
			changes: converted.changes,
			htmlAsText,
			unsafeMarkup: converted.unsafeMarkup.map((found) =>
				markupEntry(found, linesBefore),
			),
			leftOut: Object.keys(note.data).filter((key) => !MAPPED_FIELDS.has(key)),
			compile: compiled,
		});
	}

	// Reading order is file order. A note added since the last import goes
	// after the chapters already there instead of renumbering them.
	const lastExisting = Math.max(
		-1,
		...chapters.map((chapter, index) =>
			chapter.action === "new" ? -1 : index,
		),
	);
	chapters.forEach((chapter, index) => {
		if (chapter.action === "new" && index < lastExisting) {
			chapter.reason = `added after the chapters already in the book; rename chapters/${chapter.file} to move it`;
		}
	});
	chapters.sort((a, b) => comparePaths(a.file, b.file));

	const orphans = manifest.chapters
		.filter(
			(entry) =>
				!matched.has(entry.file) &&
				!noteBySource.has(entry.source) &&
				existsSync(join(chaptersDir, entry.file)),
		)
		.map(({ file, source }) => ({ file, source }));

	// Records what this import leaves on disk; kept files keep their old hash.
	const chapterEntries = new Map(
		manifest.chapters.map((entry) => [entry.file, entry]),
	);
	for (const chapter of chapters) {
		const old = chapterEntries.get(chapter.file);
		if (old) chapterEntries.delete(chapter.file);
		if (chapter.action === "keep") {
			if (old)
				chapterEntries.set(chapter.file, { ...old, source: chapter.source });
			continue;
		}
		chapterEntries.set(chapter.file, {
			source: chapter.source,
			file: chapter.file,
			sha256: sha256(chapter.content),
		});
	}
	const imageEntries = new Map(
		manifest.images.map((entry) => [entry.source, entry]),
	);
	for (const image of images) {
		if (image.action === "keep") continue;
		imageEntries.set(image.source, {
			source: image.source,
			file: image.file,
			sha256: sha256(readFileSync(join(sourceDir, image.source))),
		});
	}

	const records: PlannedRecord[] = [];
	const contentRoot = join(appDir, "src", "content", "book");
	for (const note of recordNotes) {
		if (note.section === "chapter") continue;
		let body = rewriteLinks(note, note.body);
		if (note.dropLeadingHeading) {
			const heading = firstHeading(body);
			if (heading?.leading) {
				body = body.slice(heading.length).trim();
			}
		}
		if (note.invalid) {
			problems.push({
				source: note.source,
				line: 1,
				message: `frontmatter does not parse (${note.invalid.reason}); kept in the record as an MDX comment`,
			});
			const comment = `<!--\n${note.invalid.yaml.replace(/-->/g, "-- >").trim()}\n-->\n\n`;
			body = `${comment}${body}`;
		}
		const summary =
			text(note.data.summary) ??
			text(note.data.description) ??
			text(note.data.subtitle) ??
			text(note.data.excerpt);
		const recordFields: Record<string, unknown> =
			note.section === "mechanism"
				? {
						slug: note.slug,
						status: note.status,
						title: note.title,
						definition: text(note.data.definition) ?? summary ?? note.title,
						is: stringList(note.data.is) ?? [
							`Core pattern described in ${note.title}`,
						],
						isNot: stringList(note.data.isNot) ?? [
							`Unrelated surface symptom outside ${note.title}`,
						],
						predictions: stringList(note.data.predictions) ?? [
							`Applying ${note.title} changes the observable outcome`,
						],
						tests: stringList(note.data.tests) ?? [
							`Verify whether ${note.title} holds in a concrete case`,
						],
						...(stringList(note.data.satisfies)
							? { satisfies: stringList(note.data.satisfies) }
							: {}),
					}
				: note.section === "tool"
					? {
							slug: note.slug,
							status: note.status,
							mechanism: text(note.data.mechanism) ?? firstMechanismSlug,
							name: text(note.data.name) ?? note.title,
							...(text(note.data.trigger)
								? { trigger: text(note.data.trigger) }
								: {}),
							...(typeof note.data.timeboxMinutes === "number" &&
							note.data.timeboxMinutes > 0 &&
							note.data.timeboxMinutes <= 10
								? { timeboxMinutes: note.data.timeboxMinutes }
								: {}),
							...(stringList(note.data.steps)
								? { steps: stringList(note.data.steps) }
								: {}),
						}
					: note.section === "example"
						? {
								mechanism: text(note.data.mechanism) ?? firstMechanismSlug,
								domain: text(note.data.domain) ?? "imported",
								title: note.title,
								...(summary ? { summary } : {}),
								status: note.status,
							}
						: {
								slug: note.slug,
								status: note.status,
								term: text(note.data.term) ?? note.title,
								definition: text(note.data.definition) ?? summary ?? note.title,
								...(stringList(note.data.mechanisms)
									? { mechanisms: stringList(note.data.mechanisms) }
									: {}),
							};
		const frontmatter = formatFrontmatter(recordFields);
		let converted = toMdxBody(body, { html: "jsx" });
		let content = `${frontmatter}\n${converted.body}\n`;
		let compiled = await compileMdx(content, appDir);
		if (compiled.ok === false && converted.changes.html > 0) {
			const escaped = toMdxBody(body);
			const escapedContent = `${frontmatter}\n${escaped.body}\n`;
			const retry = await compileMdx(escapedContent, appDir);
			if (retry.ok !== false) {
				converted = escaped;
				content = escapedContent;
				compiled = retry;
			}
		}
		const rel = `${SECTION_DIRS[note.section]}/${note.slug}.mdx`;
		const dest = join(contentRoot, rel);
		let action: FileAction = "new";
		let reason: string | undefined;
		if (existsSync(dest)) {
			const current = readFileSync(dest, "utf8");
			if (sha256(current) === sha256(content)) {
				action = "unchanged";
			} else if (force) {
				action = "replace";
				reason = `${rel} exists`;
			} else {
				action = "keep";
				reason = `${rel} exists`;
			}
		}
		records.push({
			source: note.source,
			section: note.section,
			file: rel,
			slug: note.slug,
			title: note.title,
			status: note.status,
			action,
			reason,
			content,
			compile: compiled,
		});
	}

	return {
		book,
		sourceDir,
		sourceLabel: options.sourceLabel ?? sourceDir,
		appDir,
		chaptersDir,
		imagesDir,
		chapters,
		records,
		images,
		skipped,
		links,
		orphans,
		problems,
		manifest: {
			about: MANIFEST_ABOUT,
			chapters: [...chapterEntries.values()].sort((a, b) =>
				comparePaths(a.file, b.file),
			),
			images: [...imageEntries.values()].sort((a, b) =>
				comparePaths(a.file, b.file),
			),
		},
	};
};

/** The actions that write a file. */
export const WRITES = new Set<FileAction>(["new", "update", "replace"]);

/**
 * Writes the plan: chapters, images, and the manifest. Each chapter written
 * is compiled again from disk; the result replaces the planned one.
 */
export const applyImport = async (plan: ImportPlan): Promise<void> => {
	mkdirSync(plan.chaptersDir, { recursive: true });
	for (const chapter of plan.chapters) {
		if (!WRITES.has(chapter.action)) continue;
		const path = join(plan.chaptersDir, chapter.file);
		writeFileSync(path, chapter.content, "utf8");
		chapter.compile = await compileMdx(readFileSync(path, "utf8"), plan.appDir);
	}
	const contentRoot = join(plan.appDir, "src", "content", "book");
	for (const record of plan.records) {
		if (!WRITES.has(record.action)) continue;
		const path = join(contentRoot, record.file);
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, record.content, "utf8");
		record.compile = await compileMdx(readFileSync(path, "utf8"), plan.appDir);
	}
	for (const image of plan.images) {
		if (!WRITES.has(image.action)) continue;
		mkdirSync(plan.imagesDir, { recursive: true });
		copyFileSync(
			join(plan.sourceDir, image.source),
			join(plan.imagesDir, image.file),
		);
	}
	writeFileSync(
		join(plan.chaptersDir, MANIFEST_FILE),
		`${JSON.stringify(plan.manifest, null, "\t")}\n`,
		"utf8",
	);
};
