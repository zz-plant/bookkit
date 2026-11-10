import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { scaffoldSource } from "../../../packages/astro-bookkit/src/validators/content-check";
import { repoRoot, slugify } from "../../_lib";
import {
	booksWithMechanism,
	chapterSource,
	findSimilarMechanisms,
	listChapterFiles,
	nextChapterFileName,
	withCorpusScope,
} from "../authoring";
import { planInsertAfter } from "../chapter-moves";
import {
	ask,
	choose,
	didYouMean,
	flagValue,
	isInteractive,
	positionals,
	writeFocusBook,
} from "../cli";
import { resolveFromCaller } from "../folder-report";
import { loadBookContent } from "../load-book";
import {
	isVersion,
	nextMinorVersion,
	releaseSource,
	releaseVersions,
} from "../release-notes";
import { titleFromSlug } from "../scaffold-book";
import { applyChanges, books, runScript, takeBook } from "./context";
import { usageOf } from "./help";

/**
 * `bookkit new` and `init`: a chapter, mechanism, tool, example, glossary
 * entry, release note, or book.
 */

export function createNew(kind: string | undefined, rest: string[]) {
	/** Flags of `bookkit new` that take a value, per kind; the rest are switches. */
	const NEW_FLAGS: Record<string, { valued: string[]; switches: string[] }> = {
		chapter: { valued: ["--after"], switches: [] },
		release: { valued: ["--version"], switches: [] },
		mechanism: { valued: ["--definition"], switches: ["--force"] },
		tool: { valued: [], switches: [] },
		example: { valued: [], switches: [] },
		glossary: { valued: ["--definition", "--mechanism"], switches: [] },
		book: {
			valued: ["--title", "--from", "--frame"],
			switches: ["--skip-starter-content", "--no-install"],
		},
	};

	const known = NEW_FLAGS[kind ?? ""];
	// A flag's value is not a title or a book: "--definition <sentence>".
	const positional = positionals(
		rest,
		Object.values(NEW_FLAGS).flatMap((flags) => flags.valued),
	);
	if (known) {
		const unknown = rest.find(
			(arg) =>
				arg.startsWith("--") &&
				!known.valued.includes(arg) &&
				!known.switches.includes(arg),
		);
		if (unknown) {
			const options = [...known.valued, ...known.switches];
			console.error(
				`new ${kind} has no option ${unknown}.${options.length > 0 ? ` Its options: ${options.join(", ")}.` : ""}${didYouMean(unknown, options)}`,
			);
			process.exit(1);
		}
	}
	const flag = (name: string) => flagValue(rest, name);

	// Without a kind, ask which (only at a terminal; scripts get the usage).
	const resolvedKind =
		kind ??
		choose("What do you want to start?", [
			{ value: "chapter", label: "the next numbered chapter" },
			{
				value: "mechanism",
				label: "a named pattern, checked against every book",
			},
			{ value: "tool", label: "a ≤10-minute action for a mechanism" },
			{ value: "example", label: "a replaceable illustration of a mechanism" },
			{ value: "glossary", label: "a term readers meet, with its definition" },
			{ value: "release", label: "a dated release note for the book" },
			{ value: "book", label: "a new book app" },
		]);

	/** The value given on the command line, else asked for, else the usage. */
	const required = (
		value: string | undefined,
		question: string,
		usage: string,
	): string => {
		const answer = value ?? ask(question);
		if (answer) return answer;
		console.error(`Usage: ${usage}`);
		process.exit(1);
	};

	/** A mechanism of `book`: the one named (checked), else picked from the book's list. */
	const mechanismOf = (
		book: string,
		named: string | undefined,
		usage: string,
	): string => {
		const mechanisms = loadBookContent(book).mechanisms;
		const slugs = mechanisms.map((mechanism) => mechanism.slug);
		if (named && slugs.includes(named)) return named;
		if (named) {
			console.error(
				`${book} has no mechanism "${named}".${didYouMean(named, slugs)} Its mechanisms: ${slugs.join(", ") || "none yet"}. To add one: bun run bookkit new mechanism ${book} "<title>".`,
			);
			process.exit(1);
		}
		const picked = choose(
			`Which mechanism in ${book}?`,
			mechanisms.map((mechanism) => ({
				value: mechanism.slug,
				label: mechanism.title,
			})),
		);
		if (picked) return picked;
		console.error(
			`Usage: ${usage}\n${book}'s mechanisms: ${slugs.join(", ") || "none yet"}`,
		);
		process.exit(1);
	};

	switch (resolvedKind) {
		case "chapter": {
			const usage =
				'bun run bookkit new chapter [book] "<title>" [--after <chapter>]';
			const [book, own] = takeBook(positional, 1, usage);
			const title = required(own[0], "Chapter title:", usage);
			const after = flag("--after");
			// --after <chapter>: in the middle, renumbering the files after it.
			const placed = after
				? planInsertAfter(book, after, slugify(title))
				: {
						...nextChapterFileName(listChapterFiles(book), title),
						changes: [],
					};
			if ("error" in placed) {
				console.error(placed.error);
				process.exit(1);
			}
			const { fileName } = placed;
			const slug = slugify(title);
			const content = loadBookContent(book);
			if (content.chapters.some((chapter) => chapter.slug === slug)) {
				console.error(
					`${book} already has a chapter with slug "${slug}". Pick another title.`,
				);
				process.exit(1);
			}
			const path = join(
				repoRoot(),
				"apps",
				book,
				"src",
				"content",
				"book",
				"chapters",
				fileName,
			);
			applyChanges(placed.changes);
			writeFileSync(
				path,
				chapterSource({
					slug,
					title,
					mechanismSlugs: content.mechanisms.map((mechanism) => mechanism.slug),
				}),
			);
			for (const change of placed.changes) {
				if (change.kind === "move") {
					console.log(
						`Renumbered ${relative(repoRoot(), change.path)} → ${relative(repoRoot(), change.to)}`,
					);
				}
			}
			console.log(`Created ${relative(repoRoot(), path)}`);
			console.log(
				`Next: write it, list the mechanisms it uses in \`mechanisms:\`, and preview with bun run bookkit dev ${book}`,
			);
			process.exit(0);
			break;
		}

		case "mechanism": {
			const usage =
				'bun run bookkit new mechanism [book] "<title>" [--definition "<one sentence>"] [--force]';
			const [book, own] = takeBook(positional, 1, usage);
			const title = required(own[0], "Mechanism title:", usage);
			const slug = slugify(title);
			const holders = booksWithMechanism(slug);
			if (holders.some((holder) => holder.book === book)) {
				console.error(`${book} already has the mechanism "${slug}".`);
				process.exit(1);
			}
			if (holders.length > 0) {
				const [holder] = holders;
				console.error(
					`${holder.book} already has "${slug}". If this is the same idea, share it: bun run bookkit sync ${slug} --to ${book} (check:corpus keeps the copies identical). If it is a different idea, choose another title.`,
				);
				process.exit(1);
			}
			// Only mechanisms in the book's own corpus can make this one a duplicate.
			const similar = withCorpusScope(
				findSimilarMechanisms({ title, definition: flag("--definition") }),
				book,
				books,
			).filter((match) => match.sameCorpus);
			if (similar.length > 0 && !rest.includes("--force")) {
				console.log(
					`Before naming a new mechanism, check whether one of these already covers it:\n`,
				);
				for (const match of similar) {
					console.log(
						`  ${match.slug}  "${match.title}"  in ${match.books.join(", ")}  (shares: ${match.sharedWords.join(", ")})`,
					);
				}
				// At the keyboard, the answer is a keypress, not a second command.
				const create = isInteractive()
					? ask(`\nNone of these fits: create "${slug}"? [y/N]`)
					: undefined;
				if (!create || !/^y(es)?$/i.test(create)) {
					console.log(
						`\nIf one fits, bind its slug in the chapter instead. If not, ${isInteractive() ? "answer y" : "rerun with --force"} to create "${slug}".`,
					);
					process.exit(1);
				}
			}
			const definition = flag("--definition");
			const status = runScript("scaffold-mechanism.ts", [
				"--book",
				book,
				"--slug",
				slug,
				"--title",
				title,
				...(definition ? ["--definition", definition] : []),
			]);
			if (status === 0) {
				console.log(
					definition
						? `Then bun run bookkit judge ${slug}: judges say, blind, whether it is the same idea as its nearest mechanisms (best once is, isNot, and tests are written: a verdict holds for the text it judged).`
						: `Then run bun run bookkit check: once the definition is written, it compares meaning across every book. To ask judges whether it is the same idea as its nearest mechanisms: bun run bookkit judge ${slug}`,
				);
			}
			process.exit(status);
			break;
		}

		case "tool": {
			const usage = 'bun run bookkit new tool [book] <mechanism-slug> "<name>"';
			const [book, own] = takeBook(positional, 2, usage);
			const mechanism = mechanismOf(book, own[0], usage);
			const name = required(own[1], "Tool name:", usage);
			process.exit(
				runScript("scaffold-tool.ts", [
					"--book",
					book,
					"--mechanism",
					mechanism,
					"--name",
					name,
				]),
			);
			break;
		}

		case "example": {
			const usage =
				'bun run bookkit new example [book] <mechanism-slug> <domain> "<title>"';
			const [book, own] = takeBook(positional, 3, usage);
			const mechanism = mechanismOf(book, own[0], usage);
			const domain = required(
				own[1],
				"Domain (the setting it happens in, e.g. Housing):",
				`${usage}\n<domain> is the setting the example happens in, such as Housing or Workplace; examples are grouped by it.`,
			);
			const title = required(own[2], "Example title:", usage);
			const status = runScript("scaffold-example.ts", [
				"--book",
				book,
				"--mechanism",
				mechanism,
				"--domain",
				domain,
				"--title",
				title,
			]);
			if (status === 0) {
				console.log(
					`Next: write the example (a case of ${mechanism}, not its definition), then bun run bookkit check ${book}`,
				);
			}
			process.exit(status);
			break;
		}

		case "glossary": {
			const usage =
				'bun run bookkit new glossary [book] "<term>" [--definition "<one sentence>"] [--mechanism <slug>]';
			const [book, own] = takeBook(positional, 1, usage);
			const term = required(own[0], "Term:", usage);
			const slug = slugify(term);
			if (!slug) {
				console.error(`"${term}" has no letters or digits for a slug.`);
				process.exit(1);
			}
			const mechanism = flag("--mechanism")
				? mechanismOf(book, flag("--mechanism"), usage)
				: undefined;
			const path = join(
				repoRoot(),
				"apps",
				book,
				"src",
				"content",
				"book",
				"glossary",
				`${slug}.mdx`,
			);
			if (existsSync(path)) {
				console.error(
					`${relative(repoRoot(), path)} already exists. Edit it, or choose another term.`,
				);
				process.exit(1);
			}
			mkdirSync(dirname(path), { recursive: true });
			writeFileSync(
				path,
				scaffoldSource(
					"glossary",
					{
						term,
						slug,
						definition: flag("--definition"),
						mechanisms: mechanism ? [mechanism] : undefined,
						status: "draft",
					},
					"What a reader needs to know when they meet the term, beyond the definition.",
				),
			);
			console.log(
				`Created ${relative(repoRoot(), path)}.\nNext: ${flag("--definition") ? "" : "write its definition, then "}link the term where a chapter first uses it, [${term.toLowerCase()}](/read/glossary/${slug}); bun run bookkit check ${book} lists first uses that are not linked.`,
			);
			process.exit(0);
			break;
		}

		case "release": {
			const usage =
				'bun run bookkit new release [book] "<title>" [--version <x.y.z>]';
			const [book, own] = takeBook(positional, 1, usage);
			const title = required(own[0], "Release title:", usage);
			const dir = join(
				repoRoot(),
				"apps",
				book,
				"src",
				"content",
				"book",
				"releases",
			);
			const version =
				flag("--version") ?? nextMinorVersion(releaseVersions(dir));
			if (!isVersion(version)) {
				console.error(
					`--version needs x.y.z, such as 1.2.0, not "${version}".`,
				);
				process.exit(1);
			}
			const date = new Date().toISOString().slice(0, 10);
			const path = join(dir, `${date}-${slugify(title)}.mdx`);
			if (existsSync(path)) {
				console.error(
					`${relative(repoRoot(), path)} already exists. Pick another title.`,
				);
				process.exit(1);
			}
			mkdirSync(dir, { recursive: true });
			writeFileSync(path, releaseSource({ title, version, date }));
			console.log(
				`Created ${relative(repoRoot(), path)} (version ${version}, ${date}).\nNext: write its summary and highlights; bun run bookkit check ${book} checks it, and the release notes page lists it.`,
			);
			process.exit(0);
			break;
		}

		case "book": {
			const slug = required(
				positional[0],
				"Book slug (lowercase-with-hyphens):",
				'bun run bookkit new book <slug> [--title "<title>"] [--frame <slug>] [--from <folder>]',
			);
			// --from <folder>: import a folder of notes once the book exists.
			const fromIndex = rest.indexOf("--from");
			if (fromIndex >= 0 && !flag("--from")) {
				console.error(
					"--from needs a folder of Markdown notes: bun run bookkit new book <slug> --from <folder>",
				);
				process.exit(1);
			}
			// At a terminal, what was left out is asked for: a title, and notes.
			const title =
				flag("--title") ??
				(isInteractive()
					? ask(`Title (Enter for "${titleFromSlug(slugify(slug))}"):`)
					: undefined);
			const from =
				flag("--from") ??
				(isInteractive()
					? ask("A folder of notes to import (Enter for none):")
					: undefined);
			const scaffoldArgs = rest.filter(
				(arg, index) =>
					arg !== slug &&
					index !== fromIndex &&
					index !== fromIndex + 1 &&
					arg !== "--title" &&
					rest[index - 1] !== "--title",
			);
			// From notes, the starter's placeholder mechanism, tool, example, and
			// overview would sit beside the author's chapters and go live with them.
			const created = runScript("scaffold-book.ts", [
				"--book",
				slug,
				...(title ? ["--title", title] : []),
				...scaffoldArgs,
				...(from ? ["--no-next"] : []),
				...(from && !scaffoldArgs.includes("--skip-starter-content")
					? ["--skip-starter-content"]
					: []),
			]);
			// The new book is the one being worked on now.
			if (created === 0) writeFocusBook(slug);
			if (created !== 0 || !from) process.exit(created);
			console.log(`\nImporting ${from} into ${slug}:`);
			process.exit(
				runScript("import-book-from-markdown.ts", [
					"--book",
					slug,
					"--dir",
					resolveFromCaller(from),
				]),
			);
			break;
		}

		default: {
			if (resolvedKind) {
				console.error(
					`Cannot start "${resolvedKind}".${didYouMean(resolvedKind, ["chapter", "mechanism", "tool", "example", "glossary", "release", "book"])}`,
				);
			}
			console.error(usageOf("new"));
			process.exit(1);
		}
	}
}
