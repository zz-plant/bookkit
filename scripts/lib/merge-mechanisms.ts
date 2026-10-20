import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";
import type { MechanismRecord } from "../../packages/astro-bookkit/src/suggestions";
import { listBookDirs, listFilesRecursive, repoRoot } from "../_lib";
import { didYouMean } from "./cli";
import {
	arrayValue,
	parseFrontmatter,
	toStringValue,
} from "./content-frontmatter";
import {
	addMergeRecord,
	type DistinctRuling,
	findRuling,
	rebindRulings,
} from "./corpus-rulings";
import { corpusScope, pairCorpus, readCorpusBooks } from "./corpus-scope";
import { loadBookContent } from "./load-book";

/**
 * `bookkit merge <keep> <drop>`: two mechanisms the author has ruled one
 * idea become one, under `keep`'s slug, in every book of their corpus. The
 * same steps as the merges recorded in corpus.json, done by hand until now:
 *
 * - one contract in every book: `keep`'s title and definition (or the
 *   author's new one), and the union of both mechanisms' lists;
 * - a book that had only `drop` gets `keep`'s slug, and keeps its own prose;
 *   a book that had both keeps `keep`'s file, with `drop`'s prose after it;
 * - `drop`'s glossary entry and examples move to `keep`, and the old term
 *   stays findable ("Also called …");
 * - every reference rebinds: frontmatter, /read/ links, slug strings in the
 *   book's code (book.config.ts, pages), and slug-only list items;
 * - corpus.json records the merge with both mechanisms as they were, and
 *   rulings on `drop` carry over to `keep`.
 *
 * Tools keep their slugs (and URLs), even when named after `drop`.
 */

/** The fields every copy of a shared mechanism must agree on. */
const CONTRACT_FIELDS = [
	"title",
	"definition",
	"is",
	"isNot",
	"predictions",
	"tests",
	"satisfies",
] as const;

const LIST_FIELDS = [
	"is",
	"isNot",
	"predictions",
	"tests",
	"satisfies",
] as const;

type Contract = Pick<MechanismRecord, (typeof CONTRACT_FIELDS)[number]>;

type Copy = MechanismRecord & { book: string; file: string };

export type FileChange =
	| { kind: "edit"; path: string; text: string }
	/** `text` is absent for a file moved as it is. */
	| { kind: "move"; path: string; to: string; text?: string }
	| { kind: "remove"; path: string };

export type MergePlan = {
	keep: string;
	drop: string;
	books: string[];
	changes: FileChange[];
	corpusPath: string;
	corpusText: string;
	contract: Contract;
	carried: DistinctRuling[];
	removed: DistinctRuling[];
	notes: string[];
	/** Lines that still name `drop`, by slug or by title, to read over. */
	leftovers: Array<{ path: string; line: number; text: string }>;
};

/** What a reference to `drop` becomes. */
export type Rebind = {
	drop: string;
	keep: string;
	/** `drop`'s names as a glossary term or title, matched case-insensitively. */
	dropTerms?: readonly string[];
	/** `keep`'s glossary term. */
	keepTerm?: string;
};

const TEXT_FILE = /\.(mdx?|astro|[cm]?[jt]sx?|json)$/;

const escapeRegExp = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** `slug` as a whole slug: not part of a longer one such as `slug--tool`. */
const slugToken = (slug: string, flags = "g"): RegExp =>
	new RegExp(`(?<![a-z0-9-])${escapeRegExp(slug)}(?![a-z0-9-])`, flags);

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

const unquote = (value: string): string =>
	value.trim().replace(/^(["'`])(.*)\1$/, "$2");

/** Drops a later item in one list that repeats an earlier one naming `slug`. */
const dedupeListItems = (lines: string[], slug: string): string[] => {
	const out: string[] = [];
	let seen = false;
	for (const line of lines) {
		const item = line.match(/^\s*[-*+]\s+(.*)$/);
		if (!item) {
			seen = false;
			out.push(line);
			continue;
		}
		if (unquote(item[1]) === slug) {
			if (seen) continue;
			seen = true;
		}
		out.push(line);
	}
	return out;
};

/** `mechanism:` and `mechanisms:` in a content file's frontmatter. */
const rebindFrontmatter = (front: string, { drop, keep }: Rebind): string => {
	let key = "";
	const out: string[] = [];
	for (const line of front.split("\n")) {
		const top = line.match(/^([A-Za-z_][\w-]*):(.*)$/);
		if (top) {
			key = top[1];
			if (key === "mechanism") {
				out.push(
					line.replace(
						new RegExp(
							`^(mechanism:\\s*)(["']?)${escapeRegExp(drop)}\\2(\\s*)$`,
						),
						`$1$2${keep}$2$3`,
					),
				);
			} else if (key === "mechanisms" && /\[.*\]/.test(top[2])) {
				const inline = top[2].match(/\[(.*)\]/)?.[1] ?? "";
				const items = inline
					.split(",")
					.map((item) => item.trim())
					.filter(Boolean)
					.map((item) =>
						unquote(item) === drop ? item.replace(drop, keep) : item,
					)
					.filter(
						(item, index, all) =>
							all.findIndex((other) => unquote(other) === unquote(item)) ===
							index,
					);
				out.push(`mechanisms: [${items.join(", ")}]`);
			} else {
				out.push(line);
			}
			continue;
		}
		const item = line.match(/^(\s*-\s+)(["']?)([a-z0-9-]+)\2\s*$/);
		if (key === "mechanisms" && item?.[3] === drop) {
			out.push(`${item[1]}${item[2]}${keep}${item[2]}`);
			continue;
		}
		out.push(line);
	}
	return dedupeListItems(out, keep).join("\n");
};

/** Links to drop's pages under /read/, in prose or code. */
const rebindLinks = (text: string, { drop, keep }: Rebind): string =>
	text.replace(
		new RegExp(
			`(?<=(?:mechanisms|glossary|examples|\\})/)${escapeRegExp(drop)}(?=[/#?)"'\`\\s\\]]|$)`,
			"gm",
		),
		keep,
	);

/**
 * The slug as a string: any quoted one in code; in prose only `drop` in
 * backticks or as a component's attribute (slug="drop"), since a quoted
 * word in a sentence may be the plain word.
 */
const rebindStrings = (
	text: string,
	{ drop, keep }: Rebind,
	prose: boolean,
): string =>
	prose
		? text
				.replace(new RegExp(`\`${escapeRegExp(drop)}\``, "g"), `\`${keep}\``)
				.replace(
					new RegExp(`(=\\{?)(["'])${escapeRegExp(drop)}\\2`, "g"),
					`$1$2${keep}$2`,
				)
		: text.replace(
				new RegExp(`(["'\`])${escapeRegExp(drop)}\\1`, "g"),
				`$1${keep}$1`,
			);

/** A Markdown or MDX file: its frontmatter, links, and slug-only list items. */
export const rebindContent = (text: string, rebind: Rebind): string => {
	const match = text.match(FRONTMATTER);
	const front = match ? rebindFrontmatter(match[1], rebind) : null;
	const head = match ? match[0].replace(match[1], () => front ?? match[1]) : "";
	const body = match ? text.slice(match[0].length) : text;
	const lines = rebindStrings(rebindLinks(body, rebind), rebind, true)
		.split("\n")
		.map((line) =>
			line.replace(
				new RegExp(`^(\\s*[-*+]\\s+)${escapeRegExp(rebind.drop)}(\\s*)$`),
				`$1${rebind.keep}$2`,
			),
		);
	return `${head}${dedupeListItems(lines, rebind.keep).join("\n")}`;
};

/** The object literal around `index`: from its `{` to its `}`. */
const enclosingObject = (
	text: string,
	index: number,
): { start: number; end: number } | null => {
	let depth = 0;
	let start = -1;
	for (let i = index; i >= 0; i -= 1) {
		if (text[i] === "}") depth += 1;
		else if (text[i] === "{") {
			if (depth === 0) {
				start = i;
				break;
			}
			depth -= 1;
		}
	}
	if (start < 0) return null;
	depth = 0;
	for (let i = start; i < text.length; i += 1) {
		if (text[i] === "{") depth += 1;
		else if (text[i] === "}") {
			depth -= 1;
			if (depth === 0) return { start, end: i + 1 };
		}
	}
	return null;
};

/**
 * A book's code (book.config.ts, pages): where `keep` already has an entry,
 * `drop`'s entry goes; otherwise `drop`'s slug and term become `keep`'s.
 */
export const rebindCode = (text: string, rebind: Rebind): string => {
	const { drop, keep } = rebind;
	let out = text;
	const slugEntry = (slug: string) =>
		new RegExp(`\\bslug:\\s*(["'\`])${escapeRegExp(slug)}\\1`);
	// An object such as { slug: "drop", focus: … } when keep has its own.
	if (slugEntry(keep).test(out)) {
		for (let found = out.match(slugEntry(drop)); found?.index !== undefined; ) {
			const object = enclosingObject(out, found.index);
			if (!object) break;
			const lineStart = out.lastIndexOf("\n", object.start) + 1;
			const after = out.slice(object.end).match(/^,?[ \t]*\r?\n?/)?.[0] ?? "";
			out = `${out.slice(0, lineStart)}${out.slice(object.end + after.length)}`;
			found = out.match(slugEntry(drop));
		}
	}
	// A one-line property keyed by the slug, such as "drop": "urgent",
	// when keep has its own.
	const keyLine = (slug: string) =>
		new RegExp(
			`^[ \\t]*(["']?)${escapeRegExp(slug)}\\1[ \\t]*:.*,[ \\t]*\\r?\\n`,
			"m",
		);
	if (keyLine(keep).test(out)) out = out.replace(keyLine(drop), "");
	// A term on its own line in a list, such as glossaryFocus.
	if (rebind.keepTerm && rebind.dropTerms?.length) {
		const keepTerm = rebind.keepTerm;
		const dropTerms = rebind.dropTerms.map((term) => term.toLowerCase());
		const isTerm = (value: string, terms: readonly string[]) =>
			terms.includes(value.toLowerCase());
		const cased = (written: string) =>
			written === written.toLowerCase() ? keepTerm.toLowerCase() : keepTerm;
		const termLine = /^([ \t]*)(["'])([^"'\n]*)\2(,?)[ \t]*$/;
		const termArray = /\[((?:\s*(["'])[^"'\n]*\2\s*,?)+)\]/g;
		const lines = out.split("\n");
		const hasKeep = lines.some(
			(line) =>
				isTerm(line.match(termLine)?.[3] ?? "", [keepTerm.toLowerCase()]) ||
				[...line.matchAll(termArray)].some(([array]) =>
					array.toLowerCase().includes(`"${keepTerm.toLowerCase()}"`),
				),
		);
		out = lines
			.flatMap((line) => {
				// A term on its own line, as in a multi-line glossaryFocus.
				const found = line.match(termLine);
				if (found) {
					if (!isTerm(found[3], dropTerms)) return [line];
					if (hasKeep) return [];
					const [, indent, quote, written, comma] = found;
					return [`${indent}${quote}${cased(written)}${quote}${comma}`];
				}
				// Terms in a one-line list: ["a", "b"].
				return [
					line.replace(termArray, (array, items: string) => {
						const entries = [...items.matchAll(/(["'])([^"'\n]*)\1/g)];
						if (!entries.some(([, , term]) => isTerm(term, dropTerms))) {
							return array;
						}
						const kept = entries.flatMap(([, quote, term]) =>
							!isTerm(term, dropTerms)
								? [`${quote}${term}${quote}`]
								: hasKeep
									? []
									: [`${quote}${cased(term)}${quote}`],
						);
						return `[${kept.join(", ")}]`;
					}),
				];
			})
			.join("\n");
	}
	return rebindStrings(rebindLinks(out, rebind), rebind, false);
};

/** A frontmatter field as YAML: a quoted string, or a list of them. */
const yamlField = (key: string, value: string | readonly string[]): string =>
	typeof value === "string"
		? `${key}: ${JSON.stringify(value)}`
		: value.length === 0
			? `${key}: []`
			: `${key}:\n${value.map((item) => `  - ${JSON.stringify(item)}`).join("\n")}`;

/**
 * The frontmatter with `key` set to `value`, in place: the key's line and
 * the indented lines under it are replaced; a missing key is added at the end.
 */
const setField = (
	front: string,
	key: string,
	value: string | readonly string[],
): string => {
	const lines = front.split("\n");
	const at = lines.findIndex((line) => line.startsWith(`${key}:`));
	if (at < 0) {
		return Array.isArray(value) && value.length === 0
			? front
			: `${front}\n${yamlField(key, value)}`;
	}
	let end = at + 1;
	while (end < lines.length && /^\s+\S/.test(lines[end])) end += 1;
	return [
		...lines.slice(0, at),
		yamlField(key, value),
		...lines.slice(end),
	].join("\n");
};

/** A scalar field set to `value`, keeping the line's quoting. */
const setScalar = (front: string, key: string, value: string): string =>
	front.replace(
		new RegExp(`^(${key}:[ \\t]*)(["']?)[^\\n]*?\\2([ \\t]*)$`, "m"),
		(_line, prefix, quote, space) =>
			`${prefix}${quote ? JSON.stringify(value) : value}${space}`,
	);

/** A mechanism file with the merged contract, and the slug when it moves. */
export const withContract = (
	text: string,
	contract: Contract,
	slug?: string,
): string => {
	const match = text.match(FRONTMATTER);
	if (!match) throw new Error("A mechanism file without frontmatter.");
	let front = match[1];
	if (slug) front = setScalar(front, "slug", slug);
	for (const field of CONTRACT_FIELDS) {
		front = setField(front, field, contract[field] ?? []);
	}
	const updated = `${match[0].replace(match[1], () => front)}${text.slice(match[0].length)}`;
	// The frontmatter must read back as the contract written.
	const { data } = parseFrontmatter(updated);
	for (const field of CONTRACT_FIELDS) {
		const expected = contract[field] ?? [];
		const actual =
			typeof expected === "string"
				? toStringValue(data[field] ?? null)
				: arrayValue(data[field] ?? null);
		if (JSON.stringify(actual) !== JSON.stringify(expected)) {
			throw new Error(`Could not write ${field} into the mechanism file.`);
		}
	}
	return updated;
};

/** The body under a file's frontmatter, without a leading `# Title`. */
const bodyOf = (text: string): string =>
	text
		.slice(text.match(FRONTMATTER)?.[0].length ?? 0)
		.replace(/^\s*#\s[^\n]*\n/, "")
		.trim();

/** "Coercive waiting" reads "coercive waiting" mid-sentence; "SLA debt" stays. */
const midSentence = (term: string): string =>
	term.slice(1) === term.slice(1).toLowerCase()
		? `${term[0].toLowerCase()}${term.slice(1)}`
		: term;

/** A glossary body that also names the old term, so it stays findable. */
const withAlias = (text: string, term: string): string => {
	if (!term || text.toLowerCase().includes(term.toLowerCase())) return text;
	return `${text.trimEnd()} Also called ${midSentence(term)}.\n`;
};

const sameContract = (a: Contract, b: Contract): string[] =>
	CONTRACT_FIELDS.filter(
		(field) =>
			JSON.stringify(a[field] ?? null) !== JSON.stringify(b[field] ?? null),
	);

const union = (...lists: ReadonlyArray<readonly string[]>): string[] => {
	const out: string[] = [];
	for (const item of lists.flat()) {
		if (!out.some((seen) => seen.trim() === item.trim())) out.push(item);
	}
	return out;
};

/** Every file of a book's src/ that can name a slug. */
const sourceFiles = (book: string): string[] => {
	const src = join(repoRoot(), "apps", book, "src");
	if (!existsSync(src)) return [];
	return listFilesRecursive(src)
		.filter((file) => TEXT_FILE.test(file))
		.map((file) => join(src, file));
};

/**
 * Everything `bookkit merge` would change, without writing it. An error names
 * what to fix first.
 */
export const planMerge = (input: {
	keep: string;
	drop: string;
	reason: string;
	definition?: string;
	date: string;
}): MergePlan | { error: string } => {
	const { keep, drop } = input;
	if (keep === drop) {
		return { error: `Name two different mechanisms; got ${keep} twice.` };
	}
	const root = repoRoot();
	const books = listBookDirs();
	const scope = corpusScope(books, readCorpusBooks());
	const loaded: Copy[] = books.flatMap((book) =>
		loadBookContent(book).mechanisms.map((m) => ({
			...m,
			book,
			file: m.file ?? "",
		})),
	);
	const slugs = [...new Set(loaded.map((m) => m.slug))];
	for (const slug of [keep, drop]) {
		if (!slugs.includes(slug)) {
			return { error: `No mechanism ${slug}.${didYouMean(slug, slugs)}` };
		}
	}
	const found = pairCorpus(keep, drop, loaded, scope);
	if ("where" in found) {
		return {
			error: `${keep} (${found.where[0]}) and ${drop} (${found.where[1]}) are in different corpora, where similar mechanisms are allowed. To hold two books to one vocabulary, list both in "books" in corpus.json.`,
		};
	}
	const corpusBooks = books.filter(
		(book) => scope.corpusOf(book) === found.corpus,
	);
	const corpusPath = join(root, "corpus.json");
	const corpusSource = existsSync(corpusPath)
		? readFileSync(corpusPath, "utf8")
		: null;
	let distinct: DistinctRuling[] = [];
	try {
		distinct = corpusSource ? (JSON.parse(corpusSource).distinct ?? []) : [];
	} catch (error) {
		return {
			error: `corpus.json is not valid JSON (${error instanceof Error ? error.message : String(error)}). Fix it first.`,
		};
	}
	const ruled = findRuling(distinct, keep, drop);
	if (ruled) {
		return {
			error: `${keep} ~ ${drop} is ruled distinct in corpus.json: ${ruled.reason}\nIf they are one idea after all, delete that ruling first.`,
		};
	}

	const copies = (slug: string) =>
		loaded.filter((m) => m.slug === slug && corpusBooks.includes(m.book));
	const keepCopies = copies(keep);
	const dropCopies = copies(drop);
	for (const [slug, held] of [
		[keep, keepCopies],
		[drop, dropCopies],
	] as const) {
		const differ = held.flatMap((copy) => sameContract(held[0], copy));
		if (differ.length > 0) {
			return {
				error: `${slug}'s copies in ${held.map((copy) => copy.book).join(", ")} differ in ${[...new Set(differ)].join(", ")}. Make them agree first; bun run bookkit check shows where.`,
			};
		}
	}
	const [keeper] = keepCopies;
	const [dropped] = dropCopies;
	const contract: Contract = {
		title: keeper.title,
		definition: input.definition?.trim() || keeper.definition,
		...Object.fromEntries(
			LIST_FIELDS.map((field) => [
				field,
				union(keeper[field] ?? [], dropped[field] ?? []),
			]),
		),
	} as Contract;

	const files = new Map<string, string>();
	const original = new Map<string, string>();
	const moves = new Map<string, string>();
	const removals = new Set<string>();
	const notes: string[] = [];
	const touched = corpusBooks.filter((book) =>
		[...keepCopies, ...dropCopies].some((copy) => copy.book === book),
	);
	for (const book of touched) {
		for (const file of sourceFiles(book)) {
			const text = readFileSync(file, "utf8");
			files.set(file, text);
			original.set(file, text);
		}
	}
	// A file that is not text (an image beside an example) moves as it is.
	const move = (from: string, to: string, text: string | undefined) => {
		const origin = [...moves].find(([, target]) => target === from)?.[0];
		files.delete(from);
		if (text !== undefined) files.set(to, text);
		moves.set(origin ?? from, to);
	};
	const remove = (file: string) => {
		files.delete(file);
		removals.add(file);
	};
	const occupied = (file: string) => existsSync(file) || files.has(file);

	// Glossary terms: keep's from any book that has an entry, else its title.
	const glossaryOf = (book: string) => {
		const dir = join(root, "apps", book, "src/content/book/glossary");
		return existsSync(dir)
			? readdirSync(dir)
					.filter((name) => /\.mdx?$/.test(name))
					.map((name) => {
						const file = join(dir, name);
						const { data } = parseFrontmatter(readFileSync(file, "utf8"));
						return {
							file,
							slug:
								toStringValue(data.slug ?? null) ||
								basename(name, extname(name)),
							term: toStringValue(data.term ?? null),
						};
					})
			: [];
	};
	const keepTerm =
		corpusBooks
			.flatMap(glossaryOf)
			.find((entry) => entry.slug === keep && entry.term)?.term ?? keeper.title;

	for (const book of touched) {
		const keepCopy = keepCopies.find((copy) => copy.book === book);
		const dropCopy = dropCopies.find((copy) => copy.book === book);
		const contentRoot = join(root, "apps", book, "src/content/book");
		if (keepCopy) {
			let text = withContract(files.get(keepCopy.file) ?? "", contract);
			if (dropCopy) {
				const prose = bodyOf(files.get(dropCopy.file) ?? "");
				if (prose) {
					text = `${text.trimEnd()}\n\n${prose}\n`;
					notes.push(
						`${relative(root, keepCopy.file)}: ${drop}'s notes are added after ${keep}'s; edit them in.`,
					);
				}
				remove(dropCopy.file);
			}
			files.set(keepCopy.file, text);
		} else if (dropCopy) {
			const target = join(
				dirname(dropCopy.file),
				`${keep}${extname(dropCopy.file)}`,
			);
			if (occupied(target)) {
				return {
					error: `${relative(root, target)} exists but is not ${keep}. Rename it first.`,
				};
			}
			move(
				dropCopy.file,
				target,
				withContract(files.get(dropCopy.file) ?? "", contract, keep),
			);
		}

		const glossary = glossaryOf(book);
		const dropEntry = glossary.find((entry) => entry.slug === drop);
		const keepEntry = glossary.find((entry) => entry.slug === keep);
		if (dropEntry) {
			if (keepEntry) {
				files.set(
					keepEntry.file,
					withAlias(files.get(keepEntry.file) ?? "", dropEntry.term),
				);
				remove(dropEntry.file);
			} else {
				const target = join(
					dirname(dropEntry.file),
					`${keep}${extname(dropEntry.file)}`,
				);
				if (occupied(target)) {
					return {
						error: `${relative(root, target)} exists but is not ${keep}'s glossary entry. Rename it first.`,
					};
				}
				let text = files.get(dropEntry.file) ?? "";
				const head = text.match(FRONTMATTER);
				if (head) {
					let front = setScalar(head[1], "term", keepTerm);
					if (/^slug:/m.test(front)) front = setScalar(front, "slug", keep);
					text = `${head[0].replace(head[1], () => front)}${text.slice(head[0].length)}`;
				}
				move(dropEntry.file, target, withAlias(text, dropEntry.term));
			}
		}

		const examples = join(contentRoot, "examples", drop);
		if (existsSync(examples)) {
			for (const name of listFilesRecursive(examples)) {
				const from = join(examples, name);
				const to = join(contentRoot, "examples", keep, name);
				if (occupied(to)) {
					return {
						error: `${relative(root, to)} exists; ${drop}'s example ${name} would replace it. Rename one first.`,
					};
				}
				move(from, to, files.get(from));
			}
		}

		const tools = [...files.keys()].filter(
			(file) =>
				file.startsWith(join(contentRoot, "toolkit")) &&
				basename(file).startsWith(`${drop}--`),
		);
		if (tools.length > 0) {
			notes.push(
				`${book}: ${tools.map((file) => basename(file, extname(file))).join(", ")} ${tools.length === 1 ? "keeps its slug and URL" : "keep their slugs and URLs"}, and now ${tools.length === 1 ? "binds" : "bind"} to ${keep}.`,
			);
		}
	}

	// Every reference to drop, in every file of the books it touches.
	const dropTerms = [
		...new Set(
			[
				dropped.title,
				...corpusBooks
					.flatMap(glossaryOf)
					.filter((entry) => entry.slug === drop)
					.map((entry) => entry.term),
			].filter(Boolean),
		),
	];
	const rebind: Rebind = { drop, keep, dropTerms, keepTerm };
	for (const [file, text] of files) {
		files.set(
			file,
			/\.mdx?$/.test(file)
				? rebindContent(text, rebind)
				: rebindCode(text, rebind),
		);
	}

	const changes: FileChange[] = [];
	for (const [from, to] of moves) {
		changes.push({ kind: "move", path: from, to, text: files.get(to) });
	}
	const moved = new Set(moves.values());
	for (const [file, text] of files) {
		if (moved.has(file) || original.get(file) === text) continue;
		changes.push({ kind: "edit", path: file, text });
	}
	for (const file of removals) changes.push({ kind: "remove", path: file });

	const leftovers: MergePlan["leftovers"] = [];
	const named = [
		slugToken(drop, ""),
		...dropTerms.map((term) => new RegExp(`\\b${escapeRegExp(term)}\\b`, "i")),
	];
	for (const [file, text] of files) {
		text.split("\n").forEach((line, index) => {
			const read = line.replace(/Also called [^.]*\./g, "");
			if (named.some((pattern) => pattern.test(read))) {
				leftovers.push({
					path: relative(root, file),
					line: index + 1,
					text: line.trim(),
				});
			}
		});
	}

	const record = {
		into: keep,
		date: input.date,
		reason: input.reason.trim(),
		before: [dropped, keeper].map((copy) => ({
			book: copy.book,
			slug: copy.slug,
			title: copy.title,
			definition: copy.definition,
			is: copy.is,
		})),
	};
	const rulings = rebindRulings(
		addMergeRecord(corpusSource, record),
		drop,
		keep,
	);
	return {
		keep,
		drop,
		books: touched,
		changes,
		corpusPath,
		corpusText: rulings.text,
		contract,
		carried: rulings.carried,
		removed: rulings.removed,
		notes,
		leftovers,
	};
};

/**
 * `bookkit sync <slug>`: every copy of a shared mechanism in its corpus gets
 * the contract of one copy, the one in `from` or else the one edited last, so
 * a contract is edited once instead of in every book.
 */
export const planSync = (
	slug: string,
	from?: string,
):
	| { from: string; books: string[]; changes: FileChange[] }
	| { error: string } => {
	const books = listBookDirs();
	const scope = corpusScope(books, readCorpusBooks());
	const loaded: Copy[] = books.flatMap((book) =>
		loadBookContent(book).mechanisms.map((m) => ({
			...m,
			book,
			file: m.file ?? "",
		})),
	);
	const held = loaded.filter((m) => m.slug === slug);
	if (held.length === 0) {
		const slugs = [...new Set(loaded.map((m) => m.slug))];
		return { error: `No mechanism ${slug}.${didYouMean(slug, slugs)}` };
	}
	if (from && !held.some((copy) => copy.book === from)) {
		return {
			error: `${from} has no ${slug}; it is in ${held.map((copy) => copy.book).join(", ")}.`,
		};
	}
	const source =
		held.find((copy) => copy.book === from) ??
		[...held].sort(
			(a, b) => statSync(b.file).mtimeMs - statSync(a.file).mtimeMs,
		)[0];
	const corpus = scope.corpusOf(source.book);
	const others = held.filter(
		(copy) => copy !== source && scope.corpusOf(copy.book) === corpus,
	);
	const changes: FileChange[] = others
		.filter((copy) => sameContract(source, copy).length > 0)
		.map((copy) => ({
			kind: "edit",
			path: copy.file,
			text: withContract(readFileSync(copy.file, "utf8"), source),
		}));
	return {
		from: source.book,
		books: others.map((copy) => copy.book),
		changes,
	};
};
