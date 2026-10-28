import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { extractPageFacts } from "../packages/astro-bookkit/src/markdown/pageFacts";
import { isReleasedStatus } from "../packages/astro-bookkit/src/schemas/status";
import { shortBookTitle } from "../packages/astro-bookkit/src/seo/page-meta";
import {
	type CorpusMechanism,
	corpusEmbeddingText,
	findRecurringTerms,
	type PairCall,
	runBookSuggestions,
} from "../packages/astro-bookkit/src/suggestions";
import {
	checkBookContent,
	readBookStatus,
} from "../packages/astro-bookkit/src/validators/book-validator";
import {
	CONTENT_SECTIONS,
	type ContentSection,
	contentContract,
	isContentSection,
	scaffoldSource,
} from "../packages/astro-bookkit/src/validators/content-check";
import { listBookDirs, listFilesRecursive, repoRoot, slugify } from "./_lib";
import {
	booksWithMechanism,
	type ChapterDraft,
	chapterDraft,
	chapterSource,
	checkContentFile,
	findSimilarMechanisms,
	findSimilarMechanismsByMeaning,
	listChapterFiles,
	loadBookConfigSummary,
	nextChapterFileName,
	similarForMechanismFile,
	summarizeBook,
	WORDING_MATCH_MIN,
	withCorpusScope,
} from "./lib/authoring";
import { buildB1Report } from "./lib/b1-report";
import { commandHelp, commandNames, findCommand } from "./lib/bookkit-commands";
import { planChapterRename, planInsertAfter } from "./lib/chapter-moves";
import {
	ask,
	choose,
	didYouMean,
	isInteractive,
	readFocusBook,
	wantsHelp,
	writeFocusBook,
} from "./lib/cli";
import { compileFinding, compileMdx } from "./lib/compile-mdx";
import { callsFor, nearestTo, readJudgments } from "./lib/corpus-judgments";
import { addDistinctRuling, findRuling } from "./lib/corpus-rulings";
import { corpusScope, pairCorpus, readCorpusBooks } from "./lib/corpus-scope";
import {
	DEFAULT_DEV_PORT,
	foregroundServer,
	runDevServer,
	stopForegroundServer,
} from "./lib/dev-server";
import {
	DEFAULT_EMBEDDING_MODEL_KEY,
	EMBEDDING_MODELS,
	embedTexts,
} from "./lib/embed-text";
import {
	isBookContentPath,
	printFolderCheck,
	printTry,
	readFolder,
	resolveFromCaller,
	runPreview,
} from "./lib/folder-report";
import {
	JUDGE_COMMAND_ENV,
	runJudges,
	splitCommands,
	unansweredJudges,
} from "./lib/judge-runner";
import { loadBookContent } from "./lib/load-book";
import { type FileChange, planMerge, planSync } from "./lib/merge-mechanisms";
import {
	draftRecords,
	publishedRecord,
	withBookStatus,
} from "./lib/publish-book";
import {
	checkReleaseNote,
	isVersion,
	nextMinorVersion,
	RELEASE_FIELDS,
	releaseSource,
	releaseVersions,
} from "./lib/release-notes";
import { exportRubric } from "./lib/rubric";
import { titleFromSlug } from "./lib/scaffold-book";
import {
	planMoveTool,
	planRemoveChapter,
	planRemoveMechanism,
	planRemoveTool,
	type StructurePlan,
} from "./lib/structure-edits";

const args = process.argv.slice(2);
// No command: the books, and the commands to write, check, preview, build, and deploy one.
const command = args[0] ?? "status";

if (command === "help" || command === "--help" || command === "-h") {
	// `help <command>` is that command's help; `help --help` is help's own.
	if (command === "help" && args[1]) {
		printHelpFor(args[1].startsWith("-") ? ["help"] : args.slice(1));
	}
	printHelp();
	process.exit(0);
}
// `bookkit <command> --help` prints that command's help before it reads or
// writes anything (lib/bookkit-commands.ts).
if (findCommand(command) && wantsHelp(args.slice(1))) printHelpFor(args);

const books = listBookDirs();

// The book set with `bookkit use`; commands that take a book default to it.
const focusBook = readFocusBook(books);

const bookChoices = () =>
	books.map((book) => ({
		value: book,
		label: book === focusBook ? "(current)" : undefined,
	}));

/**
 * The book a command acts on: the one named, else the current book (`bookkit
 * use`), else the only book, else one picked at a prompt. Exits with a
 * suggestion for a misspelled name, or with the usage when nothing can be
 * resolved.
 */
const requireBook = (book: string | undefined, usage: string): string => {
	if (book && books.includes(book)) return book;
	if (book) {
		console.error(
			`Book "${book}" not found.${didYouMean(book, books)} Available books: ${books.join(", ")}`,
		);
		process.exit(1);
	}
	const picked =
		focusBook ??
		(books.length === 1 ? books[0] : choose("Which book?", bookChoices()));
	if (picked) return picked;
	console.error(
		`Usage: ${usage}\nAvailable books: ${books.join(", ")}. Or set one with bun run bookkit use <book>, and leave it out.`,
	);
	process.exit(1);
};

/**
 * Splits a command's positional arguments into the book and the rest. The book
 * may be left out (the current book is used) when only the command's own
 * arguments are given, even one that is also a book's name (`new chapter
 * on-call` titles a chapter "on-call"); with one argument too many, the first
 * must be a book, and with too few, a book's name is the book.
 */
const takeBook = (
	positional: string[],
	ownArguments: number,
	usage: string,
): [string, string[]] => {
	if (positional.length > ownArguments) {
		return [requireBook(positional[0], usage), positional.slice(1)];
	}
	if (
		positional.length < ownArguments &&
		positional[0] &&
		books.includes(positional[0])
	) {
		return [positional[0], positional.slice(1)];
	}
	return [requireBook(undefined, usage), positional];
};

/**
 * A child process's exit code, or 1 when it has none: a command that never
 * started (not on PATH) or was killed by a signal must not read as success.
 */
function exitCodeOf(result: SpawnSyncReturns<unknown>, what: string): number {
	if (result.error) {
		console.error(`Could not run ${what}: ${result.error.message}`);
		return 1;
	}
	if (result.signal) {
		console.error(`${what} was stopped by ${result.signal}.`);
		return 1;
	}
	return result.status ?? 1;
}

/** Runs one of scripts/ with this process's own bun, so PATH does not matter. */
function runScript(script: string, scriptArgs: string[]): number {
	return exitCodeOf(
		spawnSync(
			process.execPath,
			["run", join(repoRoot(), "scripts", script), ...scriptArgs],
			{ stdio: "inherit" },
		),
		`scripts/${script}`,
	);
}

switch (findCommand(command)?.name ?? command) {
	case "status": {
		if (args.includes("--json")) {
			console.log(
				JSON.stringify(
					{ books: await Promise.all(books.map(summarizeBook)) },
					null,
					2,
				),
			);
		} else {
			const named = args[1] && !args[1].startsWith("--") ? args[1] : undefined;
			await printStatus(
				named ? requireBook(named, "bun run bookkit status [book]") : undefined,
			);
		}
		process.exit(0);
		break;
	}

	case "bets": {
		// The maintainers' own measure of the active bet (docs/bets.md), kept
		// out of the default output, which is for any author.
		const report = await buildB1Report();
		if (args.includes("--json")) {
			console.log(JSON.stringify({ b1: report }, null, 2));
		} else {
			printBets(report);
		}
		process.exit(0);
		break;
	}

	case "similar": {
		// Read-only twin of `new mechanism`'s first step, for agents and the MCP tool.
		const positional = args.slice(1).filter((arg) => !arg.startsWith("--"));
		const definitionIndex = args.indexOf("--definition");
		const definition =
			definitionIndex >= 0 ? args[definitionIndex + 1] : undefined;
		const title = positional.find((arg) => arg !== definition);
		if (!title) {
			console.error(
				'Usage: bun run bookkit similar "<title>" [--definition "<one sentence>"] [--semantic] [--json]',
			);
			process.exit(1);
		}
		const slug = slugify(title);
		// --semantic ranks by meaning with check:corpus's model; it falls back
		// to wording when the model cannot load.
		const byMeaning = args.includes("--semantic")
			? await findSimilarMechanismsByMeaning({ title, definition }, books, 5)
			: null;
		const semantic = byMeaning && "matches" in byMeaning ? byMeaning : null;
		const result = {
			title,
			slug,
			existingSlug: booksWithMechanism(slug).map((holder) => holder.book),
			method: semantic ? "meaning" : "wording",
			model: semantic?.model,
			note:
				byMeaning && "error" in byMeaning
					? `Ranked by wording; the model did not load: ${byMeaning.error}`
					: undefined,
			// By wording, a match on a word or two is noise; leave those out.
			similar:
				semantic?.matches ??
				findSimilarMechanisms({ title, definition }, books, 5).filter(
					(match) => match.score >= WORDING_MATCH_MIN,
				),
		};
		if (args.includes("--json")) {
			console.log(JSON.stringify(result, null, 2));
		} else if (result.existingSlug.length > 0) {
			console.log(
				`"${slug}" already exists in ${result.existingSlug.join(", ")}.`,
			);
		} else if (result.similar.length === 0) {
			console.log(
				`No existing mechanism shares enough wording with "${title}" to be the same idea.`,
			);
		} else {
			if (result.note) console.log(result.note);
			console.log(`Closest by ${result.method}:`);
			for (const match of result.similar) {
				const detail = semantic
					? `similarity ${match.score.toFixed(2)}`
					: `shares: ${match.sharedWords.join(", ")}`;
				console.log(
					`  ${match.slug}  "${match.title}"  in ${match.books.join(", ")}  (${detail})`,
				);
			}
		}
		process.exit(0);
		break;
	}

	case "verify": {
		process.exit(runScript("verify.ts", args.slice(1)));
		break;
	}

	case "check": {
		if (args[1] && /\.mdx?$/.test(args[1]) && isBookContentPath(args[1])) {
			await checkOneFile(
				args[1],
				args.includes("--json"),
				args.includes("--quick"),
			);
			break;
		}
		// Any other file or folder: check it where it is, without a book app.
		// A bare name that is no path stays a book name, so typos get suggestions.
		const target = args[1] && !args[1].startsWith("--") ? args[1] : undefined;
		if (
			target &&
			!books.includes(target) &&
			(existsSync(resolveFromCaller(target)) || /[\\/]|\.mdx?$/.test(target))
		) {
			// A folder of a book's content is checked as part of the book.
			if (isBookContentPath(target) && !args.includes("--frame")) {
				process.exit(await checkBookFolder(target, args.includes("--json")));
			}
			checkFolder(target, args.slice(2));
			break;
		}
		// No book: the current one (bookkit use), unless --all.
		const book =
			args[1] && !args[1].startsWith("--")
				? args[1]
				: args.includes("--all")
					? undefined
					: (focusBook ?? undefined);
		if (book) requireBook(book, "bun run bookkit check [book] [--all]");
		if (book && book === focusBook && args[1] !== book) {
			console.log(`(${book} is the current book; add --all for every book.)`);
		}
		const quick = args.includes("--quick");
		console.log(`\n🔎 Structure${book ? ` of ${book}` : " of every book"}\n`);
		const structure = book
			? runScript("validate-book.ts", ["--book", book])
			: runScript("validate-all.ts", []);
		console.log(
			`\n🔎 Mechanisms across books${quick ? " (wording only)" : " (meaning and wording)"}\n`,
		);
		const corpus = runScript("check-corpus.ts", [
			"--mode",
			"error",
			...(book ? ["--book", book] : []),
			...(quick ? ["--no-semantic"] : []),
			...(args.includes("--download-model") ? ["--download-model"] : []),
		]);
		// What a reader would trip on that is not an error: ideas named in
		// prose but not bound, mechanisms no chapter uses, terms that recur.
		if (book) {
			console.log(
				"\n🔎 Suggestions (advisory; nothing here blocks publishing)",
			);
			runScript("check-suggestions.ts", [
				book,
				...(args.includes("--info") ? ["--info"] : []),
			]);
		}
		console.log(
			`\n${structure === 0 ? "✓" : "✗"} structure  ${corpus === 0 ? "✓" : "✗"} mechanisms across books`,
		);
		if (corpus !== 0) {
			console.log(
				'  → For each cluster above: one idea, bun run bookkit merge <keep> <drop> --reason "<why>"; or different ideas, bun run bookkit rule <a> <b> --distinct "<reason>".',
			);
		}
		process.exit(structure === 0 && corpus === 0 ? 0 : 1);
		break;
	}

	case "new": {
		createNew(args[1], args.slice(2));
		break;
	}

	case "judge": {
		process.exit(await judge(args.slice(1)));
		break;
	}

	case "rule": {
		process.exit(rule(args.slice(1)));
		break;
	}

	case "merge": {
		process.exit(merge(args.slice(1)));
		break;
	}

	case "rename": {
		process.exit(renameChapter(args.slice(1)));
		break;
	}

	case "export": {
		const target = targetBooks(
			args,
			"bun run bookkit export [book] [--out <dir>] [--rubric]",
		);
		if (target.books.length !== 1) {
			console.error(
				`Name the book to export (bun run bookkit export <book>), or set one with bun run bookkit use <book>. Books: ${books.join(", ")}`,
			);
			process.exit(1);
		}
		const [book] = target.books;
		if (target.note) console.log(target.note);
		const out = flagValue(args, "--out");
		if (args.includes("--rubric")) {
			const written = exportRubric(book, out && resolveFromCaller(out));
			if ("error" in written) {
				console.error(written.error);
				process.exit(1);
			}
			const { rubric } = written;
			const same = rubric.pairs.filter((pair) => pair.label === "same_idea");
			const shown = relative(process.cwd(), written.path);
			console.log(
				`Rubric for ${rubric.books.join(", ")} (version ${rubric.version}): ${rubric.criteria.length} criteria, ${
					rubric.pairs.length > 0
						? `${rubric.pairs.length} labelled pairs (${same.length} same idea, ${rubric.pairs.length - same.length} distinct, with reasons)`
						: "no labelled pairs yet (bookkit rule and bookkit merge add them)"
				}.\nWritten to ${shown.startsWith("..") ? written.path : shown}`,
			);
			process.exit(0);
		}
		console.log(`\n📚 GitBook export of ${book}\n`);
		const status = runScript("export-gitbook.ts", [
			"--book",
			book,
			...(out ? ["--out", resolveFromCaller(out)] : []),
		]);
		// The PDF and EPUB come from the build.
		const exportsDir = join("apps", book, "dist", "exports");
		const built = ["book.pdf", "book.epub"].filter((file) =>
			existsSync(join(repoRoot(), exportsDir, file)),
		);
		// A build older than the book's latest edit no longer shows it.
		const builtAt =
			built.length > 0
				? Math.min(
						...built.map(
							(file) => statSync(join(repoRoot(), exportsDir, file)).mtimeMs,
						),
					)
				: 0;
		const srcDir = join(repoRoot(), "apps", book, "src");
		const edited = existsSync(srcDir)
			? listFilesRecursive(srcDir).filter(
					(file) => statSync(join(srcDir, file)).mtimeMs > builtAt,
				)
			: [];
		console.log(
			built.length === 0
				? `\nThe PDF and EPUB come from the build: bun run bookkit build ${book} writes them to ${exportsDir}/.`
				: edited.length > 0
					? `\nThe PDF and EPUB in ${exportsDir}/ are from a build older than ${edited.length} edited file(s) (${edited.slice(0, 2).join(", ")}${edited.length > 2 ? ", …" : ""}): bun run bookkit build ${book} remakes them.`
					: `\nPDF and EPUB from the last build, current with the book: ${built.map((file) => join(exportsDir, file)).join(", ")}.`,
		);
		process.exit(status);
		break;
	}

	case "sync": {
		process.exit(sync(args.slice(1)));
		break;
	}

	case "try": {
		// The folder may come before or after the flags.
		const target = args
			.slice(1)
			.find(
				(arg, index, list) =>
					!arg.startsWith("--") && list[index - 1] !== "--frame",
			);
		if (!target) {
			console.error(
				`Name the folder of Markdown to read.\n\n${usageOf("try")}`,
			);
			process.exit(1);
		}
		const folder = readFolder(target);
		if ("error" in folder) {
			console.error(folder.error);
			process.exit(1);
		}
		const preview = runPreview(folder.files, {
			frame: flagValue(args, "--frame"),
			name: slugify(target.split(/[\\/]/).filter(Boolean).pop() ?? "folder"),
		});
		if (args.includes("--json")) console.log(JSON.stringify(preview, null, 2));
		else printTry(target, preview, folder.files);
		process.exit(0);
		break;
	}

	case "contract": {
		const requested =
			args[1] && !args[1].startsWith("--") ? args[1] : undefined;
		// Release notes are not a content section; their page reads these fields.
		if (requested === "release") {
			const template = releaseSource({
				title: "First edition",
				version: "0.1.0",
				date: new Date().toISOString().slice(0, 10),
			});
			if (args.includes("--json")) {
				console.log(
					JSON.stringify(
						{
							section: "release",
							directory: "releases",
							fields: RELEASE_FIELDS,
							template,
						},
						null,
						2,
					),
				);
				break;
			}
			console.log("\nrelease  (src/content/book/releases/)");
			for (const field of RELEASE_FIELDS) {
				console.log(
					`  ${field.name.padEnd(18)} ${field.whenMissing.padEnd(9)} ${field.meaning}`,
				);
			}
			console.log(
				`\n  A note the page lists (bun run bookkit new release "<title>" writes one):\n${template.replace(/^/gm, "    ")}`,
			);
			break;
		}
		if (requested !== undefined && !isContentSection(requested)) {
			console.error(
				`Unknown section "${requested}". Use one of: ${CONTENT_SECTIONS.join(", ")}, or release.`,
			);
			process.exit(1);
		}
		const sections: ContentSection[] = requested
			? [requested]
			: [...CONTENT_SECTIONS];
		const contracts = sections.map((section) => contentContract(section));
		if (args.includes("--json")) {
			console.log(JSON.stringify(contracts, null, 2));
			break;
		}
		for (const contract of contracts) {
			console.log(
				`\n${contract.section}  (src/content/book/${contract.directory}/)`,
			);
			for (const field of contract.fields) {
				console.log(
					`  ${field.name.padEnd(18)} ${field.whenMissing.padEnd(9)} ${field.meaning}`,
				);
			}
			console.log(
				`\n  A file that compiles:\n${contract.template.replace(/^/gm, "    ")}`,
			);
		}
		break;
	}

	case "dev": {
		if (books.length === 0) {
			console.error("No books found in apps/*");
			process.exit(1);
		}
		// `bookkit dev` stays in the foreground. These control a server that
		// `astro dev` moved to the background itself (it does under an AI agent);
		// Astro's own `astro dev stop` only works inside the app.
		const control = ["stop", "status", "logs"].includes(args[1] ?? "")
			? args[1]
			: undefined;
		const usage = "bun run bookkit dev [book] [--port <n>]";
		const named = control ? args[2] : args[1];
		const targetBook =
			named && !named.startsWith("--")
				? requireBook(named, usage)
				: (focusBook ??
					(books.length === 1
						? books[0]
						: choose("Which book?", bookChoices())) ??
					books[0]);
		if (control) {
			// First the server `bookkit dev` runs in another terminal.
			const running = foregroundServer(targetBook);
			if (running && control === "stop") {
				stopForegroundServer(running, targetBook);
				console.log(
					`Stopped the dev server for ${targetBook} on port ${running.port}.`,
				);
				process.exit(0);
			}
			if (running && control === "status") {
				console.log(
					`The dev server for ${targetBook} is running: http://localhost:${running.port}/ (bun run bookkit dev stop ${targetBook} stops it).`,
				);
				process.exit(0);
			}
			if (running) {
				console.log(
					`The dev server for ${targetBook} runs in the foreground of another terminal; its log is there.`,
				);
				process.exit(0);
			}
			// Then one astro dev moved to the background itself. Astro answers
			// in JSON when it detects an agent; print just its message.
			const result = spawnSync("bunx", ["astro", "dev", control], {
				cwd: join(repoRoot(), "apps", targetBook),
				stdio: ["inherit", "pipe", "inherit"],
			});
			for (const line of result.stdout?.toString().split("\n") ?? []) {
				if (!line.trim()) continue;
				try {
					const parsed = JSON.parse(line) as { message?: unknown };
					console.log(
						typeof parsed.message === "string" ? parsed.message : line,
					);
				} catch {
					console.log(line);
				}
			}
			process.exit(exitCodeOf(result, `astro dev ${control}`));
		}
		const portArg = flagValue(args, "--port");
		const port = args.includes("--port") ? Number(portArg) : DEFAULT_DEV_PORT;
		if (!Number.isInteger(port) || port < 1 || port > 65535) {
			console.error(
				`--port needs a whole number from 1 to 65535${portArg ? `, not "${portArg}"` : ""}.\nUsage: ${usage}`,
			);
			process.exit(1);
		}
		console.log(`\n🚀 Starting dev server for ${targetBook}...\n`);
		process.exit(await runDevServer(targetBook, port));
		break;
	}

	case "build": {
		const target = targetBooks(args, "bun run bookkit build [book] [--all]");
		const targetBook = target.books.length === 1 ? target.books[0] : undefined;
		if (targetBook) {
			if (target.note) console.log(target.note);
			console.log(`\n📦 Building @books/${targetBook}...\n`);
			const { status, warnings } = await buildWithWarnings(targetBook);
			// After Astro's log, where the book went and what to do with it.
			const dist = join("apps", targetBook, "dist");
			const exportsDir = join(repoRoot(), dist, "exports");
			if (status === 0) {
				const files = ["book.pdf", "book.epub"].filter((file) =>
					existsSync(join(exportsDir, file)),
				);
				console.log(
					`\n✓ Built ${targetBook} in ${dist}${files.length > 0 ? `; ${files.map((file) => join(dist, "exports", file)).join(" and ")}` : ""}.`,
				);
				// Export warnings scroll past in Astro's log; repeat them here.
				if (warnings.length > 0) {
					console.log(
						`\n⚠ ${warnings.length} export warning(s): the PDF or EPUB differs from the site here.`,
					);
					for (const warning of warnings.slice(0, 5)) {
						console.log(`  ${warning}`);
					}
					if (warnings.length > 5) {
						console.log(`  … and ${warnings.length - 5} more above`);
					}
				}
				console.log(
					`Next: bun run bookkit deploy ${targetBook} --dry-run rehearses publishing it.`,
				);
			}
			process.exit(status);
		} else {
			console.log("\n📦 Building all workspace books...\n");
			const result = spawnSync(
				process.execPath,
				["run", "--workspaces", "build"],
				{ cwd: repoRoot(), stdio: "inherit" },
			);
			process.exit(exitCodeOf(result, "the build"));
		}
		break;
	}

	case "validate": {
		// As check and build: the named book, else the current one, unless --all.
		const target = targetBooks(args, "bun run bookkit validate [book] [--all]");
		const flags = args
			.slice(args[1] && !args[1].startsWith("--") ? 2 : 1)
			.filter((arg) => arg !== "--all");
		const [one] = target.books;
		if (target.note) console.log(target.note);
		process.exit(
			target.books.length === 1
				? runScript("validate-book.ts", ["--book", one, ...flags])
				: runScript("validate-all.ts", flags),
		);
		break;
	}

	case "list": {
		console.log("Available books in workspace:");
		for (const b of books) {
			console.log(`- ${b}`);
		}
		process.exit(0);
		break;
	}

	case "new-book": {
		process.exit(runScript("scaffold-book.ts", args.slice(1)));
		break;
	}

	case "remove-book": {
		process.exit(runScript("remove-book.ts", args.slice(1)));
		break;
	}

	case "remove": {
		if (args[1] === "book") {
			process.exit(runScript("remove-book.ts", args.slice(2)));
		}
		process.exit(removeRecord(args.slice(1)));
		break;
	}

	case "move": {
		process.exit(moveTool(args.slice(1)));
		break;
	}

	case "import": {
		process.exit(
			runScript("import-book-from-markdown.ts", withBookFlag(args.slice(1))),
		);
		break;
	}

	case "propose": {
		process.exit(runScript("propose-book.ts", withBookFlag(args.slice(1))));
		break;
	}

	case "publish": {
		process.exit(publish(args.slice(1)));
		break;
	}

	case "init": {
		createNew("book", args.slice(1));
		break;
	}

	case "deploy": {
		// Verifies and checks every book, then publishes all or none: scripts/deploy.ts.
		process.exit(runScript("deploy.ts", args.slice(1)));
		break;
	}

	case "use": {
		const requested =
			args[1] && !args[1].startsWith("--") ? args[1] : undefined;
		if (args.includes("--clear")) {
			writeFocusBook(undefined);
			console.log("No current book. Commands will ask, or take a book name.");
			process.exit(0);
		}
		if (!requested) {
			console.log(
				focusBook
					? `Current book: ${focusBook}. Change it with bun run bookkit use <book>, or clear it with --clear.`
					: `No current book. Set one with bun run bookkit use <book> (${books.join(", ")}).`,
			);
			process.exit(0);
		}
		const book = requireBook(requested, "bun run bookkit use <book>");
		writeFocusBook(book);
		console.log(
			`Current book: ${book}. Commands that take a book now default to it, e.g. bun run bookkit new chapter "<title>".`,
		);
		process.exit(0);
		break;
	}

	default: {
		console.error(
			`Unknown command "${command}".${didYouMean(command, commandNames())} Run bun run bookkit help for every command.`,
		);
		process.exit(1);
	}
}

/** A command's help, for an error that ends with it. */
function usageOf(name: string): string {
	const help = commandHelp([name]);
	return help && "text" in help ? help.text : "";
}

/**
 * Prints the help of the command `words` name (and exits): its own, or, for
 * a command that hands its arguments to a script, the script's.
 */
function printHelpFor(words: string[]): never {
	const help = commandHelp(words);
	if (!help) {
		console.error(
			`Unknown command "${words[0]}".${didYouMean(words[0], commandNames())} Run bun run bookkit help for every command.`,
		);
		process.exit(1);
	}
	if ("script" in help) process.exit(runScript(help.script, ["--help"]));
	console.log(help.text);
	process.exit(0);
}

/** Your books, and the commands for one: `book`, else the current one. */
async function printStatus(book?: string) {
	if (books.length === 0) {
		console.log(
			"\nBOOKKIT · no books yet\n\nStart one:  bun run bookkit new book <slug>\nOr see what your own notes would become:  bun run bookkit try <folder>\n",
		);
		return;
	}
	const summaries = await Promise.all(books.map(summarizeBook));
	const nameWidth = Math.max(...books.map((book) => book.length));
	const titleWidth = Math.min(
		40,
		Math.max(...summaries.map((s) => shortBookTitle(s.title).length)),
	);
	console.log(
		`\nBOOKKIT · ${books.length} book${books.length === 1 ? "" : "s"}\n`,
	);
	for (const s of summaries) {
		const title = shortBookTitle(s.title);
		const chapters = `${s.chapters} chapter${s.chapters === 1 ? "" : "s"}${s.stubChapters.length > 0 ? ` (${s.stubChapters.length} stub${s.stubChapters.length === 1 ? "" : "s"})` : ""}`;
		console.log(
			`  ${s.book.padEnd(nameWidth)}  ${(title.length > titleWidth ? `${title.slice(0, titleWidth - 1)}…` : title).padEnd(titleWidth)}  ${s.status.padEnd(9)}  ${chapters} · ${s.mechanisms} mechanism${s.mechanisms === 1 ? "" : "s"} · ${s.tools} tool${s.tools === 1 ? "" : "s"}`,
		);
	}
	if (summaries.some((s) => s.stubChapters.length > 0)) {
		console.log(
			"\n  Stubs are chapters with too little prose to read yet (site.minIndexableWords, default 60 words). They stay out of search until written.",
		);
	}

	// The commands for one book, from first chapter to publishing. With no
	// current book, a single book stands in; otherwise they name <book>.
	const focus =
		summaries.find((summary) => summary.book === (book ?? focusBook)) ??
		(summaries.length === 1 ? summaries[0] : undefined);
	const focusName = focus?.book ?? "<book>";
	const stub = focus?.stubChapters[0];
	const moreStubs = focus?.stubChapters.slice(1) ?? [];
	const stubPath = stub
		? join("apps", focusName, "src", "content", "book", "chapters", stub)
		: undefined;
	const stubWords = stubPath
		? extractPageFacts(readFileSync(join(repoRoot(), stubPath), "utf8"))
				.wordCount
		: 0;
	const steps: Array<[string, string, string]> = [
		stubPath
			? [
					"write",
					stubPath,
					`the next stub (${stubWords} words so far)${moreStubs.length > 0 ? `; then ${moreStubs.map((file) => file.replace(/\.mdx?$/, "")).join(", ")}` : ""}`,
				]
			: [
					"write",
					`bun run bookkit new chapter ${focusName} "<title>"`,
					"start the next chapter",
				],
		[
			"check",
			`bun run bookkit check ${focusName}`,
			"errors to fix before anyone reads it",
		],
		[
			"preview",
			`bun run bookkit dev ${focusName}`,
			"the site in your browser; it updates as you save",
		],
		[
			"build",
			`bun run bookkit build ${focusName}`,
			`the site, PDF, and EPUB, in apps/${focusName}/dist`,
		],
		[
			"deploy",
			`bun run bookkit deploy ${focusName} --dry-run`,
			"checks, builds, and rehearses; drop --dry-run to publish to Cloudflare",
		],
	];
	console.log(
		focus
			? `\nYour book: ${focusName}${focus.book === focusBook || focus.book === book ? "" : " (the only one)"}`
			: "\nName your book in each command, or set it once with bun run bookkit use <book>:",
	);
	// Short commands share a column; a long one puts its note on the next line.
	const width = Math.min(
		44,
		Math.max(...steps.map(([, command]) => command.length)),
	);
	for (const [verb, command, what] of steps) {
		console.log(
			command.length > width
				? `  ${verb.padEnd(9)}${command}\n  ${" ".repeat(9 + width)}   ${what}`
				: `  ${verb.padEnd(9)}${command.padEnd(width)}   ${what}`,
		);
	}
	console.log(
		"\n  bun run bookkit try <folder>   what Bookkit would make of your own notes (writes nothing)\n  bun run bookkit help           every command\n",
	);
}

/** Bet B1's test as measured from git history (docs/bets.md). */
function printBets(b1: Awaited<ReturnType<typeof buildB1Report>>) {
	if ("unavailable" in b1) {
		console.log(`\nB1: not measured (${b1.unavailable}).\n`);
		return;
	}
	console.log(
		`\nB1 · one argument, three drafts · ${b1.verdict}${b1.daysLeft !== undefined ? ` · ${b1.daysLeft} days to ${b1.killBy}` : ""}`,
	);
	console.log(`  ${b1.summary}`);
	console.log(
		`  Mechanisms across the corpus books: ${b1.mechanisms.before} at the start, ${b1.mechanisms.now} now${b1.mechanisms.added.length ? `; new: ${b1.mechanisms.added.join(", ")}` : ""}${b1.mechanisms.retired.length ? `; merged away: ${b1.mechanisms.retired.join(", ")}` : ""}.`,
	);
	for (const chapter of b1.drafted) {
		console.log(
			`  ✎ ${chapter.file} (${chapter.words} words)${chapter.newMechanisms.length ? ` introduces ${chapter.newMechanisms.join(", ")}` : " binds existing mechanisms only"}`,
		);
	}
	console.log("");
}

function createNew(kind: string | undefined, rest: string[]) {
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

/**
 * The books build and deploy act on: the one named, else the current book
 * (`bookkit use`), else every book. `--all` always means every book, which is
 * what CI and `bun run deploy` ask for.
 */
function targetBooks(
	list: string[],
	usage: string,
): { books: string[]; note?: string } {
	const named = list[1] && !list[1].startsWith("--") ? list[1] : undefined;
	if (named) return { books: [requireBook(named, usage)] };
	if (focusBook && !list.includes("--all")) {
		return {
			books: [focusBook],
			note: `(${focusBook} is the current book; add --all for every book.)`,
		};
	}
	return { books };
}

/**
 * Scripts that take `--book <slug>` also accept the book first (`propose
 * running-hot`), or default to the current book (`bookkit use`), else the only
 * book.
 */
function withBookFlag(rest: string[]): string[] {
	if (rest.includes("--book")) return rest;
	if (rest[0] && !rest[0].startsWith("--")) {
		return ["--book", rest[0], ...rest.slice(1)];
	}
	// The current book, else the only one: a project's one book need not be named.
	const book = focusBook ?? (books.length === 1 ? books[0] : undefined);
	return book ? ["--book", book, ...rest] : rest;
}

/** The value after a flag (`--frame runbook`), if given. */
function flagValue(list: string[], name: string): string | undefined {
	const index = list.indexOf(name);
	const value = index >= 0 ? list[index + 1] : undefined;
	return value && !value.startsWith("--") ? value : undefined;
}

/**
 * `check <folder>` for a folder of a book's content: the book's own checks
 * (its frame, status, references, and the MDX compiler), reporting only the
 * files in the folder. A folder outside a book goes to `checkFolder`.
 */
async function checkBookFolder(
	target: string,
	asJson: boolean,
): Promise<number> {
	const absolute = resolveFromCaller(target);
	const book = relative(repoRoot(), absolute).match(/^apps\/([^/]+)\//)?.[1];
	if (!book || !books.includes(book)) {
		console.error(`${target} is not in a book under apps/.`);
		return 1;
	}
	const inFolder = (file: string | undefined) =>
		Boolean(file) &&
		(file === absolute || (file as string).startsWith(`${absolute}/`));
	const content = checkBookContent({
		workspaceRoot: repoRoot(),
		bookSlug: book,
	});
	const findings = content.findings.filter((finding) => inFolder(finding.file));
	const files = statSync(absolute).isDirectory()
		? readdirSync(absolute, { recursive: true })
				.map(String)
				.filter((file) => /\.mdx?$/.test(file))
				.map((file) => join(absolute, file))
		: [absolute];
	// The compiler the build uses, unless an HTML comment already explains why it fails.
	for (const file of files.filter((path) => path.endsWith(".mdx"))) {
		if (
			findings.some(
				(finding) =>
					finding.file === file && finding.code === "MDX_HTML_COMMENT",
			)
		) {
			continue;
		}
		const compiled = compileFinding(
			await compileMdx(
				readFileSync(file, "utf8"),
				join(repoRoot(), "apps", book),
			),
		);
		if (compiled)
			findings.push({ ...compiled, file } as (typeof findings)[number]);
	}
	const errors = findings.filter((finding) => finding.level === "error").length;
	if (asJson) {
		console.log(
			JSON.stringify(
				{
					book,
					folder: relative(repoRoot(), absolute),
					files: files.length,
					ok: errors === 0,
					findings: findings.map((finding) => ({
						...finding,
						file: finding.file ? relative(repoRoot(), finding.file) : undefined,
					})),
				},
				null,
				2,
			),
		);
		return errors === 0 ? 0 : 1;
	}
	console.log(
		`\n${errors === 0 ? "✓" : "✗"} ${relative(repoRoot(), absolute)}: ${files.length} file(s), checked as part of ${book}${content.releaseMode ? " (release rules)" : ""}`,
	);
	for (const file of files.sort()) {
		const own = findings.filter((finding) => finding.file === file);
		if (own.length === 0) continue;
		const failed = own.some((finding) => finding.level === "error");
		console.log(
			`  ${failed ? "✗" : "!"} ${relative(absolute, file) || relative(repoRoot(), file)}`,
		);
		for (const finding of own) {
			console.log(`      ${finding.level}: ${finding.message}`);
			if (finding.fix) console.log(`        fix: ${finding.fix}`);
		}
	}
	console.log(
		`\n  ${errors} error(s), ${findings.length - errors} warning(s). The whole book: bun run bookkit check ${book}`,
	);
	return errors === 0 ? 0 : 1;
}

/** `check <folder|file>` outside a book app: the folder preview as a gate. */
function checkFolder(target: string, rest: string[]) {
	const folder = readFolder(target);
	if ("error" in folder) {
		console.error(folder.error);
		process.exit(1);
	}
	const frame = flagValue(rest, "--frame");
	const preview = runPreview(folder.files, {
		frame,
		requireFrameSteps: Boolean(frame),
		releaseMode: rest.includes("--release"),
	});
	if (rest.includes("--json")) {
		console.log(
			JSON.stringify({ ok: preview.errors === 0, ...preview }, null, 2),
		);
	} else {
		printFolderCheck(target, preview);
	}
	process.exit(preview.errors === 0 ? 0 : 1);
}

/** `check <release note>`: what the release notes page would do wrong with it. */
function checkReleaseFile(path: string, asJson: boolean): number {
	const absolute = resolveFromCaller(path);
	if (!existsSync(absolute)) {
		console.error(`No such file: ${path}`);
		return 1;
	}
	const findings = checkReleaseNote(readFileSync(absolute, "utf8"));
	const shown = relative(repoRoot(), absolute);
	if (asJson) {
		console.log(
			JSON.stringify(
				{ section: "release", file: shown, ok: true, findings },
				null,
				2,
			),
		);
		return 0;
	}
	console.log(
		`\n${findings.length === 0 ? "✓" : "!"} ${shown}: release note${findings.length === 0 ? ", listed on the release notes page as written" : ""}`,
	);
	for (const finding of findings) {
		console.log(`  ${finding.level}: ${finding.message}`);
		console.log(`    fix: ${finding.fix.replace(/\n/g, "\n         ")}`);
	}
	return 0;
}

async function checkOneFile(path: string, asJson: boolean, quick = false) {
	if (/\/content\/book\/releases\//.test(resolveFromCaller(path))) {
		process.exit(checkReleaseFile(path, asJson));
	}
	const checked = checkContentFile(path);
	if ("error" in checked) {
		console.error(checked.error);
		process.exit(1);
	}
	const { book, section, file } = checked;
	// Then the compiler the build uses, unless an HTML comment already explains
	// why it would fail.
	const compiled =
		file.endsWith(".mdx") &&
		!checked.result.findings.some(
			(finding) => finding.code === "MDX_HTML_COMMENT",
		)
			? compileFinding(
					await compileMdx(
						readFileSync(file, "utf8"),
						join(repoRoot(), "apps", book),
					),
				)
			: null;
	const findings = [
		...checked.result.findings,
		...(compiled ? [compiled] : []),
	];
	const result = {
		...checked.result,
		findings,
		ok: !findings.some((finding) => finding.level === "error"),
	};
	// A mechanism file also gets the duplicate check `new mechanism` runs.
	const similar =
		section === "mechanism"
			? similarForMechanismFile(result.frontmatter, book)
			: [];
	const slug =
		typeof result.frontmatter?.slug === "string" ? result.frontmatter.slug : "";
	const judged =
		section === "mechanism" && slug
			? await judgedForMechanism(slug, book, quick)
			: null;
	// The book's suggestions about this file: advice, never a failure.
	const suggestions = suggestionsForFile(book, file);
	// A chapter's word count against the stub threshold, and what it binds.
	const draft =
		section === "chapter"
			? chapterDraft(
					readFileSync(file, "utf8"),
					Array.isArray(result.frontmatter?.mechanisms)
						? result.frontmatter.mechanisms.filter(
								(slug): slug is string => typeof slug === "string",
							)
						: [],
					loadBookContent(book).mechanisms.map((m) => m.slug),
					(await loadBookConfigSummary(book)).site,
				)
			: null;
	if (asJson) {
		console.log(
			JSON.stringify(
				{
					book,
					section,
					...result,
					frontmatter: undefined,
					body: undefined,
					similar,
					judged,
					suggestions,
					draft,
				},
				null,
				2,
			),
		);
		process.exit(result.ok ? 0 : 1);
	}
	console.log(
		`\n${result.ok ? "✓" : "✗"} ${path} (${section} in ${book}): ${result.findings.length === 0 ? "compiles with no findings" : `${result.findings.length} finding(s)`}`,
	);
	for (const finding of result.findings) {
		console.log(`  ${finding.level}: ${finding.message}`);
		if (finding.fix)
			console.log(`    fix: ${finding.fix.replace(/\n/g, "\n    ")}`);
	}
	const describe = (match: (typeof similar)[number]) =>
		`    ${match.slug} (${match.books.join(", ")}) ${match.score}${match.ruledDistinct ? ` — ruled distinct: ${match.ruledDistinct}` : ""}`;
	const ownCorpus = similar.filter((match) => match.sameCorpus);
	const elsewhere = similar.filter((match) => !match.sameCorpus);
	if (ownCorpus.length > 0) {
		console.log("  may duplicate (by wording):");
		for (const match of ownCorpus) console.log(describe(match));
	}
	// A pair you ruled on needs nothing more.
	if (ownCorpus.some((match) => !match.ruledDistinct)) {
		console.log(
			`    Same idea: bun run bookkit merge <that slug> ${slug || "<this slug>"} --reason "<why>". Different: bun run bookkit rule <a> <b> --distinct "<reason>".`,
		);
	}
	if (elsewhere.length > 0) {
		console.log(
			`  similar wording in books outside ${book}'s corpus (for information; nothing to change):`,
		);
		for (const match of elsewhere) console.log(describe(match));
	}
	if (judged) printJudged(slug, judged);
	if (draft) printDraft(draft);
	if (suggestions.length > 0) {
		console.log("  suggestions (advisory; they never fail a check):");
		for (const suggestion of suggestions) {
			console.log(`    ${suggestion.message}`);
			console.log(`      → ${suggestion.nextAction}`);
		}
	}
	process.exit(result.ok ? 0 : 1);
}

function printDraft(draft: ChapterDraft) {
	console.log(
		draft.stub
			? `  draft: ${draft.words} words of prose, a stub until ${draft.minimum}. A stub stays out of search and does not count as drafted.`
			: `  draft: ${draft.words} words of prose.`,
	);
	console.log(
		`  binds: ${draft.binds.length > 0 ? draft.binds.join(", ") : "no mechanism yet"}${draft.unknown.length > 0 ? ` (${draft.unknown.join(", ")}: not a mechanism of this book; see the error above)` : ""}.`,
	);
	if (draft.unbound.length > 0) {
		console.log(
			`  the book's other mechanisms: ${draft.unbound.join(", ")}. Bind one by adding its slug to mechanisms: before naming a new idea.`,
		);
	}
}

/** The warning-level suggestions `bookkit check <book>` makes about one file. */
function suggestionsForFile(
	book: string,
	file: string,
): Array<{ category: string; message: string; nextAction: string }> {
	const content = loadBookContent(book);
	const recurring = findRecurringTerms(content.chapterBodies, {
		vocabulary: content.vocabulary,
	});
	return runBookSuggestions({
		book,
		mechanisms: content.mechanisms,
		chapters: content.chapters,
		examples: content.examples,
		chapterBodies: content.chapterBodies,
		conceptFlags: recurring.candidates,
		vocabulary: content.vocabulary,
		frame: content.frame,
		tools: content.tools,
	})
		.filter(
			(suggestion) =>
				suggestion.file === file && suggestion.severity !== "info",
		)
		.map(({ category, message, nextAction }) => ({
			category,
			message,
			nextAction,
		}));
}

type MechanismJudges = {
	calls: Array<{ other: string; call: PairCall; ruledDistinct: boolean }>;
	/** Of its 3 nearest mechanisms in its corpus, those with no verdict and no ruling. */
	unasked: string[];
	nearestBy: "meaning" | "wording";
};

/**
 * Judges' calls on a mechanism's pairs (corpus-judgments.json), as its text
 * reads now, and which of its 3 nearest in its corpus have neither a verdict
 * nor a ruling: by meaning when check:corpus has stored every vector, else by
 * wording. An edited mechanism has no current verdicts, so its nearest are
 * unjudged under either ranking; the ranking matters only for unchanged
 * text, whose vectors are stored. --judge-for ranks the same way.
 */
async function judgedForMechanism(
	slug: string,
	book: string,
	quick: boolean,
): Promise<MechanismJudges> {
	const read = readJudgments(repoRoot());
	const records = "error" in read ? [] : read.records;
	const books = listBookDirs();
	const scope = corpusScope(books, readCorpusBooks());
	const corpus = books
		.filter((other) => scope.corpusOf(other) === scope.corpusOf(book))
		.flatMap((other) =>
			loadBookContent(other).mechanisms.map((m) => ({ ...m, book: other })),
		);
	const unique = [
		...new Map(
			corpus.filter((m) => m.definition.trim()).map((m) => [m.slug, m]),
		).values(),
	];
	let distinct: Array<{ pair: [string, string] }> = [];
	try {
		const corpusPath = join(repoRoot(), "corpus.json");
		if (existsSync(corpusPath))
			distinct = JSON.parse(readFileSync(corpusPath, "utf8")).distinct ?? [];
	} catch {
		// check:corpus reports an unreadable corpus.json.
	}
	const ruled = (other: string) =>
		distinct.some(({ pair }) => pair.includes(slug) && pair.includes(other));
	const calls = callsFor(slug, records, corpus).map((judged) => ({
		...judged,
		ruledDistinct: ruled(judged.other),
	}));
	const target = unique.find((m) => m.slug === slug);
	if (!target) return { calls, unasked: [], nearestBy: "wording" };
	let vectorOf: ((m: CorpusMechanism) => Float32Array | null) | undefined;
	if (!quick) {
		const embedded = await embedTexts(
			unique.map(corpusEmbeddingText),
			EMBEDDING_MODELS[DEFAULT_EMBEDDING_MODEL_KEY],
			// Stored vectors only: loading the model would cost seconds per edit.
			{ storedOnly: true, interactive: false, log: () => {} },
		);
		if (embedded.ok) {
			const bySlug = new Map(
				unique.map((m, index) => [m.slug, embedded.vectors[index]]),
			);
			vectorOf = (m) => bySlug.get(m.slug) ?? null;
		}
	}
	const judgedOthers = new Set(calls.map(({ other }) => other));
	const unasked = nearestTo(target, unique, 3, vectorOf)
		.map((m) => m.slug)
		.filter((other) => !judgedOthers.has(other) && !ruled(other));
	return { calls, unasked, nearestBy: vectorOf ? "meaning" : "wording" };
}

function printJudged(slug: string, judges: MechanismJudges) {
	// A pair the author ruled on is settled, whatever the judges said.
	const open = judges.calls.filter(
		({ call, ruledDistinct }) => call.call !== "distinct" && !ruledDistinct,
	);
	for (const { other, call } of open) {
		console.log(
			call.call === "same-idea"
				? `  judges: the same idea as ${other} (${call.votes} of ${call.votes}). Fold it in: bun run bookkit merge ${other} ${slug} --reason "<why>"; or: bun run bookkit rule ${slug} ${other} --distinct "<reason>"`
				: `  judges split on ${other}: same idea ${call.call === "split" ? call.sameIdea : 0} of ${call.votes}. Settle it: bun run bookkit merge ${other} ${slug} --reason "<why>", or bun run bookkit rule ${slug} ${other} --distinct "<reason>"`,
		);
	}
	if (judges.calls.length > 0 && open.length === 0) {
		console.log(
			`  judges: compared it with ${judges.calls.length} mechanism(s); none is open (not the same idea, or you ruled the pair).`,
		);
	}
	// Verdicts follow the text, so an edited definition starts with none.
	// Named only when ranked by meaning, as `bookkit judge` ranks when it can;
	// by wording, the pairs it asks about may differ.
	if (judges.unasked.length > 0) {
		console.log(
			judges.nearestBy === "meaning"
				? `  judges: no verdict yet on ${judges.unasked.join(", ")}, among its 3 nearest. Ask: bun run bookkit judge ${slug}`
				: `  judges: no verdict yet on some of its nearest mechanisms. Ask: bun run bookkit judge ${slug}`,
		);
	}
}

/** Where `bookkit judge` writes requests: per-author state, gitignored. */
function judgingDir(): string {
	return join(repoRoot(), ".bookkit", "judging");
}

/** Request folders, newest first (by key.json's time). */
function requestFolders(): string[] {
	const root = judgingDir();
	return existsSync(root)
		? readdirSync(root)
				.map((name) => join(root, name))
				.filter((folder) => existsSync(join(folder, "key.json")))
				.sort(
					(a, b) =>
						statSync(join(b, "key.json")).mtimeMs -
						statSync(join(a, "key.json")).mtimeMs,
				)
		: [];
}

/** The newest request folder that has answers in it. */
function newestAnswered(): { folder: string } | { error: string } {
	const requests = requestFolders();
	const answered = requests.find((folder) =>
		readdirSync(folder).some((file) => /^answer.*\.json$/i.test(file)),
	);
	if (answered) return { folder: answered };
	return {
		error:
			requests.length === 0
				? "No judging requests yet. Start one with bun run bookkit judge [mechanism]."
				: `No answers yet in ${requests[0]}. Save judge n's reply there as answer-<n>.json, then run this again.`,
	};
}

/**
 * The judge commands: every --run, else the environment's, one per line,
 * unless --no-run. With several, judge n is asked with the nth, in turn.
 */
function judgeCommands(rest: string[]): string[] {
	if (rest.includes("--no-run")) return [];
	const passed = rest.flatMap((arg, index) =>
		arg === "--run" && rest[index + 1] && !rest[index + 1].startsWith("--")
			? [rest[index + 1]]
			: [],
	);
	return passed.length > 0
		? passed
		: splitCommands(process.env[JUDGE_COMMAND_ENV]);
}

/** How to have bookkit ask the judges itself. */
function judgeCommandHint(): string {
	return `To have bookkit ask them and record the answers: set ${JUDGE_COMMAND_ENV} to a command that reads a prompt on stdin and prints the reply (an LLM's command-line tool), or pass --run "<command>". Several commands (one per line, or --run more than once) ask the judges in turn, so a panel can mix models.`;
}

/**
 * Asks the judges in `folder` that have not answered, with `command`, then
 * records the answers once every judge has one.
 */
async function askAndRecord(
	folder: string,
	commands: string[],
): Promise<number> {
	const waiting = unansweredJudges(folder);
	if (waiting.length > 0) {
		console.log(
			commands.length === 1
				? `\nAsking ${waiting.length} judge(s), each on its own, with: ${commands[0]}`
				: `\nAsking ${waiting.length} judge(s), each on its own, with ${commands.length} commands in turn: ${commands.join("; ")}`,
		);
		const results = await runJudges(folder, commands);
		for (const result of results) {
			const asked = commands.length > 1 ? `${result.command}, ` : "";
			console.log(
				result.answer
					? `  ✓ judge ${result.judge} (${asked}${result.seconds}s)`
					: `  ✗ judge ${result.judge} (${asked}${result.seconds}s): ${result.error}`,
			);
		}
		if (results.some((result) => !result.answer)) {
			console.log(
				`\nNot recorded: every judge needs an answer. Ask the rest again: bun run bookkit judge run ${relative(process.cwd(), folder) || "."}\n(or save a judge's reply by hand as answer-<n>.json in that folder).`,
			);
			return 1;
		}
	}
	console.log("");
	return runScript("check-corpus.ts", ["--judge-record", folder]);
}

/**
 * bookkit judge [slug]: a blind request for judges (check:corpus
 * --judge-prompt), in a fresh folder under .bookkit/judging/; with a judge
 * command, it asks them and records the answers too. bookkit judge run
 * [folder]: asks the judges that have not answered. bookkit judge record
 * [folder]: reads the answers back (--judge-record).
 */
async function judge(rest: string[]): Promise<number> {
	if (rest[0] === "record" || rest[0] === "run") {
		const named =
			rest[1] && !rest[1].startsWith("--")
				? resolveFromCaller(rest[1])
				: undefined;
		if (rest[0] === "run") {
			const commands = judgeCommands(rest);
			if (commands.length === 0) {
				console.error(`No judge command. ${judgeCommandHint()}`);
				return 1;
			}
			const folder = named ?? requestFolders()[0];
			if (!folder) {
				console.error(
					"No judging requests yet. Start one with bun run bookkit judge [mechanism].",
				);
				return 1;
			}
			return askAndRecord(folder, commands);
		}
		const found = named ? { folder: named } : newestAnswered();
		if ("error" in found) {
			console.error(found.error);
			return 1;
		}
		return runScript("check-corpus.ts", ["--judge-record", found.folder]);
	}
	const slug = rest[0] && !rest[0].startsWith("--") ? rest[0] : undefined;
	const rulings = rest.includes("--rulings");
	if (rulings && slug) {
		console.error(
			"bookkit judge --rulings asks about every ruled pair; leave out the mechanism.",
		);
		return 1;
	}
	const passed = (name: string) => {
		const index = rest.indexOf(name);
		return index >= 0 && rest[index + 1] ? [name, rest[index + 1]] : [];
	};
	const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
	const name = slug ?? (rulings ? "rulings" : "corpus");
	let folder = join(judgingDir(), `${name}-${stamp}`);
	for (let n = 2; existsSync(folder); n += 1) {
		folder = join(judgingDir(), `${name}-${stamp}-${n}`);
	}
	const commands = judgeCommands(rest);
	const status = runScript("check-corpus.ts", [
		"--judge-prompt",
		folder,
		...(slug ? ["--judge-for", slug] : []),
		// The ruled pairs need no ranking, so no model.
		...(rulings ? ["--judge-rulings", "--no-semantic"] : []),
		...passed("--judge-top"),
		...passed("--judges"),
		...(rest.includes("--quick") && !rulings ? ["--no-semantic"] : []),
		...(rest.includes("--download-model") ? ["--download-model"] : []),
		...(commands.length > 0 ? ["--asked-by", commands.join("; ")] : []),
	]);
	// Nothing to judge writes no request.
	if (status !== 0 || !existsSync(join(folder, "key.json"))) return status;
	if (commands.length === 0) {
		console.log(`\n${judgeCommandHint()}`);
		return 0;
	}
	return askAndRecord(folder, commands);
}

/**
 * bookkit rule <a> <b> --distinct "<reason>": the author's ruling that two
 * mechanisms in the shared corpus are different ideas, added to corpus.json.
 * The other ruling, one idea, is bookkit merge.
 */
function rule(rest: string[]): number {
	const usage =
		'bun run bookkit rule <mechanism> <mechanism> --distinct "<reason>"';
	if (rest.includes("--same") || rest.includes("--merge")) {
		console.error(
			'bookkit rule records distinct rulings. For one idea: bun run bookkit merge <keep> <drop> --reason "<why they are one idea>".',
		);
		return 1;
	}
	const reasonIndex = rest.indexOf("--distinct");
	const reason = reasonIndex >= 0 ? rest[reasonIndex + 1] : undefined;
	const [a, b] = rest.filter(
		(arg, index) => !arg.startsWith("--") && index !== reasonIndex + 1,
	);
	if (!a || !b || reasonIndex < 0) {
		console.error(`Usage: ${usage}`);
		return 1;
	}
	if (a === b) {
		console.error(`Name two different mechanisms; got ${a} twice.`);
		return 1;
	}
	// A ruling settles a pair within one corpus: the shared one (corpus.json
	// "books"), or a book outside it, which check:corpus checks on its own.
	const books = listBookDirs();
	const scope = corpusScope(books, readCorpusBooks());
	const loaded = books.flatMap((book) =>
		loadBookContent(book).mechanisms.map((m) => ({ ...m, book })),
	);
	const slugs = [...new Set(loaded.map((m) => m.slug))];
	for (const slug of [a, b]) {
		if (slugs.includes(slug)) continue;
		console.error(`No mechanism ${slug}.${didYouMean(slug, slugs)}`);
		return 1;
	}
	const found = pairCorpus(a, b, loaded, scope);
	if ("where" in found) {
		console.error(
			`${a} (${found.where[0]}) and ${b} (${found.where[1]}) are in different corpora, where similar mechanisms are allowed, so there is nothing to rule. To hold two books to one vocabulary, list both in "books" in corpus.json.`,
		);
		return 1;
	}
	const { corpus } = found;
	const shared = loaded.filter((m) => scope.corpusOf(m.book) === corpus);
	const corpusPath = join(repoRoot(), "corpus.json");
	const text = existsSync(corpusPath) ? readFileSync(corpusPath, "utf8") : null;
	let distinct: Array<{ pair: [string, string]; reason: string }> = [];
	try {
		distinct = text ? (JSON.parse(text).distinct ?? []) : [];
	} catch (error) {
		console.error(
			`corpus.json is not valid JSON (${error instanceof Error ? error.message : String(error)}). Fix it first.`,
		);
		return 1;
	}
	const existing = findRuling(distinct, a, b);
	if (existing) {
		console.error(
			`${a} ~ ${b} is already ruled distinct: ${existing.reason}\nTo change the ruling, edit it in corpus.json.`,
		);
		return 1;
	}
	const read = readJudgments(repoRoot());
	const call =
		"error" in read
			? undefined
			: callsFor(a, read.records, shared).find(({ other }) => other === b)
					?.call;
	if (!reason?.trim() || reason.startsWith("--")) {
		console.error(
			"--distinct needs the reason, in your words: what each one's lever is, so a reader can tell them apart.",
		);
		if (call?.call === "distinct") {
			console.error(`  The judges' draft: ${call.draft}`);
		}
		console.error(`Usage: ${usage}`);
		return 1;
	}
	writeFileSync(
		corpusPath,
		addDistinctRuling(text, { pair: [a, b], reason: reason.trim() }),
	);
	console.log(`Ruled ${a} ~ ${b} distinct in corpus.json.`);
	if (call && call.call !== "distinct") {
		console.log(
			"  The judges called them the same idea, or split; your ruling stands over theirs.",
		);
	}
	console.log(
		"Next: bun run bookkit check no longer flags the pair. Commit corpus.json with the chapters it concerns.",
	);
	return 0;
}

/** Positional arguments, skipping the values of the named flags. */
function positionals(list: string[], valued: string[]): string[] {
	const values = new Set(
		valued.map((name) => list.indexOf(name) + 1).filter((index) => index > 0),
	);
	return list.filter(
		(arg, index) => !arg.startsWith("--") && !values.has(index),
	);
}

/** Writes a merge or sync: moves, then edits, then removals. */
function applyChanges(changes: FileChange[]) {
	for (const change of changes) {
		if (change.kind !== "move") continue;
		mkdirSync(dirname(change.to), { recursive: true });
		if (change.text === undefined) {
			renameSync(change.path, change.to);
		} else {
			writeFileSync(change.to, change.text);
			rmSync(change.path);
		}
	}
	for (const change of changes) {
		if (change.kind === "edit") writeFileSync(change.path, change.text);
	}
	for (const change of changes) {
		if (change.kind === "remove") rmSync(change.path, { force: true });
	}
	// A folder a move emptied, such as examples/<drop>/.
	for (const change of changes) {
		if (change.kind !== "move") continue;
		const folder = dirname(change.path);
		if (existsSync(folder) && readdirSync(folder).length === 0) {
			rmdirSync(folder);
		}
	}
}

/** One line per change, as paths from the workspace root. */
function printChanges(changes: FileChange[]) {
	const at = (path: string) => relative(repoRoot(), path);
	for (const change of changes) {
		if (change.kind === "move") {
			console.log(`  → ${at(change.path)} → ${at(change.to)}`);
		} else if (change.kind === "edit") {
			console.log(`  ~ ${at(change.path)}`);
		} else {
			console.log(`  - ${at(change.path)}`);
		}
	}
}

/**
 * bookkit merge <keep> <drop> --reason "<why>": the author's ruling that two
 * mechanisms are one idea, carried out in every book of their corpus and
 * recorded in corpus.json (lib/merge-mechanisms.ts).
 */
function merge(rest: string[]): number {
	const usage =
		'bun run bookkit merge <keep> <drop> --reason "<why they are one idea>" [--definition "<one sentence>"] [--dry-run]';
	const [keep, drop] = positionals(rest, ["--reason", "--definition"]);
	if (!keep || !drop) {
		console.error(
			`Usage: ${usage}\n<keep> stays, in every book that has either one; <drop> is folded into it.`,
		);
		return 1;
	}
	const reason = flagValue(rest, "--reason");
	if (!reason?.trim()) {
		console.error(
			"--reason needs why they are one idea, in your words: the lever and the evidence they share. corpus.json keeps it with both mechanisms as they were.",
		);
		console.error(`Usage: ${usage}`);
		return 1;
	}
	const definition = flagValue(rest, "--definition");
	const plan = planMerge({
		keep,
		drop,
		reason,
		definition,
		date: new Date().toISOString().slice(0, 10),
	});
	if ("error" in plan) {
		console.error(plan.error);
		return 1;
	}
	const dryRun = rest.includes("--dry-run");
	console.log(
		`${dryRun ? "Would merge" : "Merged"} ${drop} into ${keep} in ${plan.books.join(", ")}:`,
	);
	printChanges(plan.changes);
	console.log(
		`  ~ corpus.json: the merge, with both mechanisms as they were${plan.carried.length > 0 ? `; ${plan.carried.length} ruling(s) on ${drop} now on ${keep}` : ""}`,
	);
	const lists = (["is", "isNot", "predictions", "tests"] as const)
		.map((field) => `${field} ${plan.contract[field].length}`)
		.join(", ");
	console.log(
		`\nOne contract in every copy: ${definition ? "your definition" : `${keep}'s title and definition`}; both mechanisms' items, without repeats (${lists}).`,
	);
	for (const ruling of plan.carried) {
		console.log(
			`  Ruled distinct, carried over: ${ruling.pair.join(" ~ ")}: ${ruling.reason}`,
		);
	}
	if (plan.carried.length > 0) {
		console.log(`  Reread those reasons: they were written about ${drop}.`);
	}
	for (const note of plan.notes) console.log(`  ${note}`);
	if (plan.leftovers.length > 0) {
		console.log(`\nStill naming ${drop} (read these over):`);
		for (const left of plan.leftovers.slice(0, 12)) {
			console.log(`  ${left.path}:${left.line}  ${left.text}`);
		}
		if (plan.leftovers.length > 12) {
			console.log(`  … and ${plan.leftovers.length - 12} more`);
		}
	}
	if (dryRun) {
		console.log("\nNothing written (--dry-run).");
		return 0;
	}
	applyChanges(plan.changes);
	writeFileSync(plan.corpusPath, plan.corpusText);
	console.log(
		`\nLinks to ${drop}'s own pages (/read/mechanisms/${drop}) no longer resolve; for a published book, say so in its release notes.`,
	);
	console.log(
		`To change the shared contract later: edit it in one book, then bun run bookkit sync ${keep}.`,
	);
	console.log(
		"Next: bun run bookkit check, then commit the books and corpus.json together.",
	);
	return 0;
}

/**
 * `sync <slug> --to <book>`: the mechanism shared with a book that has no copy
 * of it: one copy's file (--from, else the one edited last) copied into the
 * book's mechanisms/, so check:corpus keeps the copies the same from then on.
 */
function shareMechanism(
	slug: string,
	to: string,
	from: string | undefined,
	dryRun: boolean,
): number {
	requireBook(to, "bun run bookkit sync <mechanism> --to <book>");
	const holders = books.flatMap((book) =>
		loadBookContent(book)
			.mechanisms.filter((m) => m.slug === slug && m.file)
			.map((m) => ({ book, file: m.file as string })),
	);
	if (holders.length === 0) {
		const slugs = [
			...new Set(
				books.flatMap((book) =>
					loadBookContent(book).mechanisms.map((m) => m.slug),
				),
			),
		];
		console.error(`No mechanism ${slug}.${didYouMean(slug, slugs)}`);
		return 1;
	}
	if (holders.some((holder) => holder.book === to)) {
		console.error(
			`${to} already has ${slug}. bun run bookkit sync ${slug} keeps its copies the same.`,
		);
		return 1;
	}
	if (from && !holders.some((holder) => holder.book === from)) {
		console.error(
			`${from} has no ${slug}; it is in ${holders.map((holder) => holder.book).join(", ")}.`,
		);
		return 1;
	}
	const source =
		holders.find((holder) => holder.book === from) ??
		[...holders].sort(
			(a, b) => statSync(b.file).mtimeMs - statSync(a.file).mtimeMs,
		)[0];
	const target = join(
		repoRoot(),
		"apps",
		to,
		"src",
		"content",
		"book",
		"mechanisms",
		`${slug}.mdx`,
	);
	if (existsSync(target)) {
		console.error(
			`${relative(repoRoot(), target)} exists but is not ${slug}. Rename it first.`,
		);
		return 1;
	}
	console.log(
		`${dryRun ? "Would share" : "Shared"} ${slug} with ${to}, copied from ${source.book}:\n  + ${relative(repoRoot(), target)}`,
	);
	if (dryRun) {
		console.log("\nNothing written (--dry-run).");
		return 0;
	}
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, readFileSync(source.file, "utf8"));
	console.log(
		`\nNext: list ${slug} in the mechanisms: of ${to}'s chapters that use it, then bun run bookkit check ${to}. Edit the contract in one book and bun run bookkit sync ${slug} copies it to the others.`,
	);
	return 0;
}

/** bookkit sync <slug> [--from <book>]: one contract for every copy. */
function sync(rest: string[]): number {
	const usage =
		"bun run bookkit sync <mechanism> [--from <book>] [--to <book>] [--dry-run]";
	const [slug] = positionals(rest, ["--from", "--to"]);
	const unknown = rest.filter(
		(arg) =>
			arg.startsWith("--") && !["--from", "--to", "--dry-run"].includes(arg),
	);
	if (!slug || unknown.length > 0) {
		console.error(
			`${unknown.length > 0 ? `Unknown option ${unknown.join(", ")}.\n` : ""}Usage: ${usage}\nCopies one copy's contract (default: the one edited last) to the mechanism's other books in its corpus; --to <book> also shares it with a book that has no copy yet.`,
		);
		return 1;
	}
	const from = flagValue(rest, "--from");
	const to = flagValue(rest, "--to");
	if (to) return shareMechanism(slug, to, from, rest.includes("--dry-run"));
	const plan = planSync(slug, from);
	if ("error" in plan) {
		console.error(plan.error);
		return 1;
	}
	if (plan.changes.length === 0) {
		console.log(
			plan.books.length === 0
				? `${slug} is in ${plan.from} only; there is nothing to sync.`
				: `${slug} already reads the same in ${[plan.from, ...plan.books].join(", ")}.`,
		);
		return 0;
	}
	const dryRun = rest.includes("--dry-run");
	console.log(
		`${dryRun ? "Would copy" : "Copied"} ${slug}'s contract from ${plan.from}${from ? "" : " (the copy edited last; --from <book> picks another)"} to:`,
	);
	printChanges(plan.changes);
	if (dryRun) {
		console.log("\nNothing written (--dry-run).");
		return 0;
	}
	applyChanges(plan.changes);
	return 0;
}

/**
 * Builds one book in its folder, passing its output through, and collects
 * the export warnings (an image the PDF or EPUB shows as alt text, text a
 * font cannot draw) for the summary.
 */
async function buildWithWarnings(
	book: string,
): Promise<{ status: number; warnings: string[] }> {
	const child = Bun.spawn([process.execPath, "run", "build"], {
		cwd: join(repoRoot(), "apps", book),
		stdin: "inherit",
		stdout: "inherit",
		stderr: "pipe",
	});
	const warnings: string[] = [];
	const decoder = new TextDecoder();
	let pending = "";
	const collect = (line: string) => {
		const match = line.match(/\[bookkit\] ((?:PDF|EPUB) export: .*)$/);
		if (match) warnings.push(match[1]);
	};
	const reader = child.stderr.getReader();
	for (;;) {
		const { done, value: chunk } = await reader.read();
		if (done) break;
		process.stderr.write(chunk);
		pending += decoder.decode(chunk, { stream: true });
		const lines = pending.split("\n");
		pending = lines.pop() ?? "";
		for (const line of lines) collect(line);
	}
	collect(pending);
	const code = await child.exited;
	if (child.signalCode) {
		console.error(`The ${book} build was stopped by ${child.signalCode}.`);
		return { status: 1, warnings };
	}
	return { status: code, warnings };
}

/**
 * `publish [book] [--dry-run] [--records]`: the book checked with the release
 * rules it would be held to, then `status: "published"` in book.config.ts.
 * Nothing changes while an error stands. --records first marks the book's
 * draft records published, for an author who left them draft by default.
 */
function publish(rest: string[]): number {
	const usage = "bun run bookkit publish [book] [--dry-run] [--records]";
	const unknown = rest.filter(
		(arg) => arg.startsWith("--") && !["--dry-run", "--records"].includes(arg),
	);
	if (unknown.length > 0) {
		console.error(`Unknown option ${unknown.join(", ")}.
Usage: ${usage}`);
		return 1;
	}
	const dryRun = rest.includes("--dry-run");
	const book = requireBook(
		rest.find((arg) => !arg.startsWith("--")),
		usage,
	);
	const configPath = join(repoRoot(), "apps", book, "src", "book.config.ts");
	const shownConfig = relative(repoRoot(), configPath);
	const status = readBookStatus(repoRoot(), book) ?? "draft";
	if (isReleasedStatus(status)) {
		console.log(
			`${book} is already ${status}. To put it online: bun run bookkit deploy ${book} --dry-run, then without --dry-run.`,
		);
		return 0;
	}
	if (!existsSync(configPath)) {
		console.error(`${shownConfig} is missing.`);
		return 1;
	}
	const nextConfig = withBookStatus(
		readFileSync(configPath, "utf8"),
		"published",
	);
	if (!nextConfig) {
		console.error(
			`${shownConfig} has no status: line to change. Add status: "published" to bookConfig yourself, then run bun run bookkit check ${book}.`,
		);
		return 1;
	}

	const drafts = draftRecords(book);
	const records = rest.includes("--records");
	// The records as they were, to put back if the book still fails.
	const originals = new Map<string, string>();
	if (records && drafts.length > 0) {
		for (const path of drafts) {
			const text = readFileSync(path, "utf8");
			originals.set(path, text);
			writeFileSync(path, publishedRecord(text));
		}
		console.log(
			`${dryRun ? "Checking" : "Marking"} ${drafts.length} draft record(s) as published (--records):`,
		);
		for (const path of drafts.slice(0, 10)) {
			console.log(`  ${relative(repoRoot(), path)}`);
		}
		if (drafts.length > 10) console.log(`  … and ${drafts.length - 10} more`);
	}

	console.log(
		`\n🔎 ${book} checked with the rules a published book is held to\n`,
	);
	const checked = runScript("validate-book.ts", ["--book", book, "--release"]);
	// A dry run, or a book that still fails, keeps its records as they were.
	if (checked !== 0 || dryRun) {
		for (const [path, text] of originals) writeFileSync(path, text);
	}
	if (checked !== 0) {
		console.log(
			[
				"",
				`Not published: fix the errors above; ${shownConfig} still says status: "${status}"${originals.size > 0 ? ", and the draft records are drafts again" : ""}.`,
				...(drafts.length > 0 && !records
					? [
							`${drafts.length} record(s) are drafts. If they are finished, bun run bookkit publish ${book} --records marks them published too.`,
						]
					: []),
			].join("\n"),
		);
		return 1;
	}
	if (dryRun) {
		console.log(
			`\nReady: nothing above blocks publishing. bun run bookkit publish ${book}${records ? " --records" : ""} sets status: "published" in ${shownConfig}.`,
		);
		return 0;
	}
	writeFileSync(configPath, nextConfig);
	const notes = releaseVersions(
		join(repoRoot(), "apps", book, "src", "content", "book", "releases"),
	);
	const next: Array<[string, string]> = [
		...(notes.length === 0
			? [
					[
						`bun run bookkit new release ${book} "First edition"`,
						"a release note readers see",
					] as [string, string],
				]
			: []),
		[`bun run bookkit deploy ${book} --dry-run`, "rehearse putting it online"],
		[`bun run bookkit deploy ${book}`, "put it online"],
	];
	const width = Math.max(...next.map(([command]) => command.length));
	console.log(
		[
			"",
			`Set status: "published" in ${shownConfig}. The site is now indexable (robots.txt and the sitemap open), and every check holds the book to release rules.`,
			"Next:",
			...next.map(([command, what]) => `  ${command.padEnd(width)}   ${what}`),
		].join("\n"),
	);
	return 0;
}

/** Prints a structure plan; writes it unless --dry-run. */
function carryOut(
	plan: StructurePlan,
	[would, did]: [string, string],
	rest: string[],
): number {
	if ("error" in plan) {
		console.error(plan.error);
		return 1;
	}
	const dryRun = rest.includes("--dry-run");
	console.log(`${dryRun ? would : did}:`);
	printChanges(plan.changes);
	for (const note of plan.notes) console.log(`  ${note}`);
	if (plan.leftovers.length > 0) {
		console.log("\nStill naming it (read these over):");
		for (const left of plan.leftovers.slice(0, 12)) {
			console.log(`  ${left.path}:${left.line}  ${left.text}`);
		}
		if (plan.leftovers.length > 12) {
			console.log(`  … and ${plan.leftovers.length - 12} more`);
		}
	}
	if (dryRun) {
		console.log("\nNothing written (--dry-run).");
		return 0;
	}
	applyChanges(plan.changes);
	return 0;
}

/**
 * `remove chapter|mechanism|tool [book] <slug> [--dry-run]`: the record and
 * the references that would break with it gone. A mechanism with tools or
 * examples needs --with-records to take them too.
 */
function removeRecord(rest: string[]): number {
	const kinds = ["chapter", "mechanism", "tool"];
	const usage =
		"bun run bookkit remove chapter|mechanism|tool [book] <slug> [--dry-run] [--with-records]\n       bun run bookkit remove book <slug>";
	const [kind, ...own] = positionals(rest, []);
	const unknown = rest.filter(
		(arg) =>
			arg.startsWith("--") && !["--dry-run", "--with-records"].includes(arg),
	);
	if (!kind || !kinds.includes(kind) || unknown.length > 0) {
		console.error(
			`${unknown.length > 0 ? `Unknown option ${unknown.join(", ")}.\n` : kind && !kinds.includes(kind) ? `Cannot remove a "${kind}".${didYouMean(kind, [...kinds, "book"])}\n` : ""}Usage: ${usage}`,
		);
		return 1;
	}
	const [book, [slug]] = takeBook(own, 1, usage);
	if (!slug) {
		console.error(`Usage: ${usage}`);
		return 1;
	}
	const plan =
		kind === "chapter"
			? planRemoveChapter(book, slug)
			: kind === "tool"
				? planRemoveTool(book, slug)
				: planRemoveMechanism(book, slug, rest.includes("--with-records"));
	const status = carryOut(
		plan,
		[
			`Would remove ${kind} ${slug} from ${book}`,
			`Removed ${kind} ${slug} from ${book}`,
		],
		rest,
	);
	if (status === 0 && !rest.includes("--dry-run")) {
		console.log(
			`\nIts page, /read/${kind === "tool" ? "toolkit" : `${kind}s`}/${slug}, is gone; for a published book, say so in its release notes.\nNext: bun run bookkit check ${book}`,
		);
	}
	return status;
}

/** `move tool [book] <tool> --to <mechanism> [--dry-run]`: a tool bound to another mechanism. */
function moveTool(rest: string[]): number {
	const usage =
		"bun run bookkit move tool [book] <tool> --to <mechanism> [--dry-run]";
	const [kind, ...own] = positionals(rest, ["--to"]);
	const to = flagValue(rest, "--to");
	if (kind !== "tool" || !to) {
		console.error(`Usage: ${usage}`);
		return 1;
	}
	const [book, [slug]] = takeBook(own, 1, usage);
	if (!slug) {
		console.error(`Usage: ${usage}`);
		return 1;
	}
	const status = carryOut(
		planMoveTool(book, slug, to),
		[
			`Would bind tool ${slug} to ${to} in ${book}`,
			`Bound tool ${slug} to ${to} in ${book}`,
		],
		rest,
	);
	if (status === 0 && !rest.includes("--dry-run")) {
		console.log(`\nNext: bun run bookkit check ${book}`);
	}
	return status;
}

/**
 * `rename mechanism [book] <slug> <new-slug> [--title "…"] [--dry-run]`: a
 * mechanism's slug changed in every book of its corpus, with every reference
 * to it (chapters, tools, examples and their folder, glossary, links,
 * config), and corpus.json recording the old slug, so a stale reference
 * names the new one. Slugs are durable identifiers: a published book's
 * readers lose /read/mechanisms/<slug>.
 */
function renameMechanism(rest: string[]): number {
	const usage =
		'bun run bookkit rename mechanism [book] <slug> <new-slug> [--title "<title>"] [--dry-run]';
	const own = positionals(rest, ["--title"]);
	const [book, slugs] =
		own.length > 2
			? [requireBook(own[0], usage), own.slice(1)]
			: [undefined, own];
	const [from, toRaw] = slugs;
	if (!from || !toRaw) {
		console.error(`Usage: ${usage}`);
		return 1;
	}
	const to = slugify(toRaw);
	const title = flagValue(rest, "--title");
	const plan = planMerge({
		keep: to,
		drop: from,
		reason: `Renamed ${from} to ${to}.`,
		date: new Date().toISOString().slice(0, 10),
		rename: { title, book },
	});
	if ("error" in plan) {
		console.error(plan.error);
		return 1;
	}
	const dryRun = rest.includes("--dry-run");
	console.log(
		`${dryRun ? "Would rename" : "Renamed"} mechanism ${from} to ${to}${title ? ` ("${title}")` : ""} in ${plan.books.join(", ")}:`,
	);
	printChanges(plan.changes);
	console.log(
		`  ~ corpus.json: ${from} recorded as renamed to ${to}${plan.carried.length > 0 ? `; ${plan.carried.length} ruling(s) moved to ${to}` : ""}`,
	);
	for (const note of plan.notes) console.log(`  ${note}`);
	if (plan.leftovers.length > 0) {
		console.log(`\nStill naming ${from} (read these over):`);
		for (const left of plan.leftovers.slice(0, 12)) {
			console.log(`  ${left.path}:${left.line}  ${left.text}`);
		}
		if (plan.leftovers.length > 12) {
			console.log(`  … and ${plan.leftovers.length - 12} more`);
		}
	}
	if (dryRun) {
		console.log("\nNothing written (--dry-run).");
		return 0;
	}
	applyChanges(plan.changes);
	writeFileSync(plan.corpusPath, plan.corpusText);
	console.log(
		`\nLinks to /read/mechanisms/${from} from outside the books no longer resolve; for a published book, say so in its release notes.\nNext: bun run bookkit check, then commit the books and corpus.json together.`,
	);
	return 0;
}

/**
 * bookkit rename chapter [book] <slug> <new-slug> [--title "…"] [--dry-run]:
 * the chapter's slug, its file name, other chapters' prerequisites, and links
 * to it, changed together (lib/chapter-moves.ts).
 */
function renameChapter(rest: string[]): number {
	const usage =
		'bun run bookkit rename chapter [book] <slug> <new-slug> [--title "<title>"] [--dry-run]';
	if (rest[0] === "mechanism") return renameMechanism(rest.slice(1));
	if (rest[0] !== "chapter") {
		console.error(
			`Usage: ${usage}\n       bun run bookkit rename mechanism [book] <slug> <new-slug> [--title "<title>"] [--dry-run]`,
		);
		return 1;
	}
	const own = positionals(rest.slice(1), ["--title"]);
	const [book, slugs] =
		own[0] && books.includes(own[0]) && own.length > 2
			? [own[0], own.slice(1)]
			: [
					focusBook ??
						(books.length === 1 ? books[0] : requireBook(undefined, usage)),
					own,
				];
	const [from, to] = slugs;
	if (!from || !to) {
		console.error(`Usage: ${usage}`);
		return 1;
	}
	const plan = planChapterRename(book, from, to, flagValue(rest, "--title"));
	if ("error" in plan) {
		console.error(plan.error);
		return 1;
	}
	const dryRun = rest.includes("--dry-run");
	console.log(
		`${dryRun ? "Would rename" : "Renamed"} chapter ${from} to ${plan.to} in ${book}:`,
	);
	printChanges(plan.changes);
	if (plan.leftovers.length > 0) {
		console.log(`\nStill naming ${from} (read these over):`);
		for (const left of plan.leftovers.slice(0, 12)) {
			console.log(`  ${left.path}:${left.line}  ${left.text}`);
		}
	}
	if (dryRun) {
		console.log("\nNothing written (--dry-run).");
		return 0;
	}
	applyChanges(plan.changes);
	console.log(
		`\nLinks to /read/chapters/${from} from outside the book no longer resolve; for a published book, say so in its release notes.\nNext: bun run bookkit check ${book}`,
	);
	return 0;
}

function printHelp() {
	console.log(`Bookkit — write, check, preview, and publish books

Usage: bun run bookkit <command>       (no command: your books, and the commands to write, check,
                                       preview, build, and deploy one)

Start
  try <folder> [--frame <slug>] [--json]    what Bookkit would make of any folder of Markdown (writes nothing)
  use [book]                                pick the book you're working on; [book] below defaults to it
  new                                       asks what to start, then anything it needs
  init [slug] [--from <folder>]             a new book (same as new book)

Write
  new chapter [book] "<title>" [--after <chapter>]
                                            start the next chapter as a draft; --after puts it after
                                            that chapter (its slug, or its number: --after 3)
  new mechanism [book] "<title>" [--definition "…"]
                                            name a mechanism, after checking every book for one that fits
  new tool [book] <mechanism> "<name>"      a ≤10-minute action for a mechanism
  new example [book] <mechanism> <domain> "<title>"
  new glossary [book] "<term>" [--definition "…"] [--mechanism <slug>]
                                            a glossary entry: a term readers meet
  new book <slug> [--from <folder>] [--frame <slug>]
                                            a new book app; --from imports a folder of notes into it
  import [book] --dir <path> [--dry-run]    turn a folder of Markdown notes into chapters; --dry-run shows the plan
  new release [book] "<title>"              a dated release note, the next version unless --version
  rename chapter [book] <slug> <new-slug> [--title "…"]
                                            a chapter's slug, file, prerequisites, and links, together
  rename mechanism [book] <slug> <new-slug> [--title "…"]
                                            a mechanism's slug in every book of its corpus, with every
                                            reference to it; corpus.json records the old one
  propose [book] [--apply all|…]            draft mechanisms, tools, edges, and config from a book's text
  remove chapter|mechanism|tool [book] <slug> [--dry-run]
                                            the record, and the prerequisites and mechanisms: entries
                                            that name it; a mechanism's tools and examples need
                                            --with-records
  move tool [book] <tool> --to <mechanism>  bind a tool to another mechanism

Check
  status [book] [--json]                    chapters, stubs, mechanisms, and tools per book
  check [book] [--all] [--quick] [--info] [--download-model]
                                            structure, plus mechanisms that overlap across books; the
                                            meaning pass needs a 550 MB model, downloaded once with
                                            consent (--quick compares wording only); as info, each
                                            chapter's first unlinked use of a glossary term; --info
                                            adds the info-level suggestions
  check <file.mdx> [--json] [--quick]       one content file: each finding with its field and fix; for a
                                            mechanism, similar ones, the judges' calls on it, and which of
                                            its 3 nearest have no verdict (--quick: nearest by wording); for
                                            a chapter, its words against the stub threshold, what it binds,
                                            and the book's other mechanisms
  check <folder|file> [--frame <slug>] [--json] [--release]
                                            any Markdown, where it is: the content contract, plus each frame
                                            section once --frame is given; exits 1 on an error (for CI);
                                            --release checks it as a published book, so drafts are errors
  contract [section] [--json]               the fields a mechanism, tool, example, chapter, glossary entry,
                                            or release note needs
  verify [--all] [--list] [--json]          the checks your change needs, judged by the files it touches
  judge [mechanism] [--judges 3] [--run "<command>"]
                                            ask judges, blind, whether close mechanisms are the same idea: one
                                            mechanism's 3 nearest without a verdict, or the corpus's flagged and
                                            closest pairs; writes a prompt per judge in .bookkit/judging/. With a
                                            judge command (--run, or BOOKKIT_JUDGE_COMMAND), asks each one and
                                            records the answers with the command that gave them; several
                                            (--run again, or one per line) ask the judges in turn
  judge --rulings [--judges 3] [--run "<command>"]
                                            ask judges about your ruled pairs, blind, so check:corpus --eval
                                            can score a new panel (or model) against your rulings
  judge run [folder] [--run "<command>"]    ask the judges that have not answered (default: the newest request)
  judge record [folder]                     record answers saved by hand (default: the newest with answers)
  rule <a> <b> --distinct "<reason>"        rule two mechanisms different ideas, in corpus.json
  merge <keep> <drop> --reason "<why>" [--definition "…"] [--dry-run]
                                            rule them one idea: <drop> becomes <keep> in every book of the
                                            corpus (contract, files, links, config) and corpus.json records it
  sync <mechanism> [--from <book>] [--to <book>]
                                            copy one copy's contract (default: the one edited last) to the
                                            mechanism's other books; --to shares it with a book that has none
  similar "<title>" [--definition "…"] [--semantic]
                                            existing mechanisms, in any book, that a new one might duplicate
  validate [book]                           structure only

Preview and publish
  dev [book] [--port <n>]                   local preview with live reload; runs until stopped
                                            (also: preview, serve, start)
  dev stop|status|logs [book]               stop or find a dev server bookkit dev (or astro dev) left running
  build [book] [--all]                      build one book (no book: the current one, or all)
  export [book] [--out <dir>]               a GitBook folder of the book; says where the PDF and EPUB are
  export [book] --rubric [--out <file>]     the book's corpus as an eval rubric: one criterion per mechanism,
                                            and your rulings as labelled pairs (default:
                                            apps/<book>/exports/rubric.json)
  publish [book] [--dry-run] [--records]  move a book from draft to published: checks it with release
                                            rules first, then sets status: "published" in book.config.ts;
                                            --records also marks its draft records published
  deploy [book...] [--all] [--dry-run [--full]] [--no-build]
                                            verify, build, and check each book, then put it online, all or
                                            none; --dry-run skips the engine's tests (--full runs them);
                                            no book: the current one, or all; --all for every book
                                            (bun run bookkit deploy --help for every option)

Other
  list                                      list the books
  remove book <slug>                        delete a book app (also: remove-book <slug>)
  bets [--json]                             the maintainers' active bet (docs/bets.md), measured from git

bun run bookkit <command> --help (or bun run bookkit help <command>) prints a
command's arguments and examples. Mistype a command, book, or mechanism and
bookkit suggests the closest one.

Examples
  bun run bookkit
  bun run bookkit try ~/notes/runbooks
  bun run bookkit check ./docs/runbooks --frame runbook
  bun run bookkit use running-hot
  bun run bookkit new chapter "Repair has a clock"
  bun run bookkit new mechanism bad-people "Waiting as leverage"
  bun run bookkit check running-hot
  bun run bookkit dev running-hot
  bun run bookkit deploy on-call --dry-run
`);
}
