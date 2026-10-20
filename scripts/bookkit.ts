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
import { shortBookTitle } from "../packages/astro-bookkit/src/seo/page-meta";
import {
	type CorpusMechanism,
	corpusEmbeddingText,
	type PairCall,
} from "../packages/astro-bookkit/src/suggestions";
import {
	CONTENT_SECTIONS,
	type ContentSection,
	contentContract,
	isContentSection,
} from "../packages/astro-bookkit/src/validators/content-check";
import { listBookDirs, repoRoot, slugify } from "./_lib";
import {
	booksWithMechanism,
	chapterSource,
	checkContentFile,
	findSimilarMechanisms,
	findSimilarMechanismsByMeaning,
	listChapterFiles,
	nextChapterFileName,
	similarForMechanismFile,
	summarizeBook,
	withCorpusScope,
} from "./lib/authoring";
import { buildB1Report } from "./lib/b1-report";
import {
	ask,
	choose,
	didYouMean,
	isInteractive,
	readFocusBook,
	writeFocusBook,
} from "./lib/cli";
import { compileFinding, compileMdx } from "./lib/compile-mdx";
import { callsFor, nearestTo, readJudgments } from "./lib/corpus-judgments";
import { addDistinctRuling, findRuling } from "./lib/corpus-rulings";
import { corpusScope, pairCorpus, readCorpusBooks } from "./lib/corpus-scope";
import { DEFAULT_DEV_PORT, runDevServer } from "./lib/dev-server";
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
	unansweredJudges,
} from "./lib/judge-runner";
import { loadBookContent } from "./lib/load-book";
import { type FileChange, planMerge, planSync } from "./lib/merge-mechanisms";

const args = process.argv.slice(2);
// No command: the books, and the commands to write, check, preview, build, and deploy one.
const command = args[0] ?? "status";

if (command === "help" || command === "--help" || command === "-h") {
	printHelp();
	process.exit(0);
}

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
 * use`), else one picked at a prompt. Exits with a suggestion for a misspelled
 * name, or with the usage when nothing can be resolved.
 */
const requireBook = (book: string | undefined, usage: string): string => {
	if (book && books.includes(book)) return book;
	if (book) {
		console.error(
			`Book "${book}" not found.${didYouMean(book, books)} Available books: ${books.join(", ")}`,
		);
		process.exit(1);
	}
	const picked = focusBook ?? choose("Which book?", bookChoices());
	if (picked) return picked;
	console.error(
		`Usage: ${usage}\nAvailable books: ${books.join(", ")}. Or set one with bun run bookkit use <book>, and leave it out.`,
	);
	process.exit(1);
};

/**
 * Splits a command's positional arguments into the book and the rest. The book
 * may be left out (the current book is used) when only the command's own
 * arguments are given; with one argument too many, the first must be a book.
 */
const takeBook = (
	positional: string[],
	ownArguments: number,
	usage: string,
): [string, string[]] => {
	if (positional[0] && books.includes(positional[0])) {
		return [positional[0], positional.slice(1)];
	}
	if (positional.length > ownArguments) {
		return [requireBook(positional[0], usage), positional.slice(1)];
	}
	return [requireBook(undefined, usage), positional];
};

/**
 * A child process's exit code, or 1 when it has none: a command that never
 * started (not on PATH) or was killed by a signal must not read as success.
 */
const exitCodeOf = (
	result: SpawnSyncReturns<unknown>,
	what: string,
): number => {
	if (result.error) {
		console.error(`Could not run ${what}: ${result.error.message}`);
		return 1;
	}
	if (result.signal) {
		console.error(`${what} was stopped by ${result.signal}.`);
		return 1;
	}
	return result.status ?? 1;
};

/** Runs one of scripts/ with this process's own bun, so PATH does not matter. */
const runScript = (script: string, scriptArgs: string[]): number =>
	exitCodeOf(
		spawnSync(
			process.execPath,
			["run", join(repoRoot(), "scripts", script), ...scriptArgs],
			{ stdio: "inherit" },
		),
		`scripts/${script}`,
	);

switch (command) {
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
			await printStatus();
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
			similar:
				semantic?.matches ??
				findSimilarMechanisms({ title, definition }, books, 5),
		};
		if (args.includes("--json")) {
			console.log(JSON.stringify(result, null, 2));
		} else if (result.existingSlug.length > 0) {
			console.log(
				`"${slug}" already exists in ${result.existingSlug.join(", ")}.`,
			);
		} else if (result.similar.length === 0) {
			console.log(`No existing mechanism shares wording with "${title}".`);
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
			checkFolder(target, args.slice(2));
			break;
		}
		const book = args[1] && !args[1].startsWith("--") ? args[1] : undefined;
		if (book) requireBook(book, "bun run bookkit check [book]");
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
				"Usage: bun run bookkit try <folder> [--frame <slug>] [--json]\nShows what Bookkit would make of any folder of Markdown. Reads only; writes nothing.",
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
		else printTry(target, preview);
		process.exit(0);
		break;
	}

	case "contract": {
		const requested =
			args[1] && !args[1].startsWith("--") ? args[1] : undefined;
		if (requested !== undefined && !isContentSection(requested)) {
			console.error(
				`Unknown section "${requested}". Use one of: ${CONTENT_SECTIONS.join(", ")}.`,
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
				: (focusBook ?? choose("Which book?", bookChoices()) ?? books[0]);
		if (control) {
			const result = spawnSync("bunx", ["astro", "dev", control], {
				cwd: join(repoRoot(), "apps", targetBook),
				stdio: "inherit",
			});
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
			const result = spawnSync(
				process.execPath,
				["run", "--filter", `@books/${targetBook}`, "build"],
				{ cwd: repoRoot(), stdio: "inherit" },
			);
			process.exit(exitCodeOf(result, `the ${targetBook} build`));
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
		const targetBook =
			args[1] && !args[1].startsWith("--")
				? requireBook(args[1], "bun run bookkit validate [book]")
				: undefined;
		process.exit(
			targetBook
				? runScript("validate-book.ts", [
						"--book",
						targetBook,
						...args.slice(2),
					])
				: runScript("validate-all.ts", args.slice(1)),
		);
		break;
	}

	case "list":
	case "list:books": {
		console.log("Available books in workspace:");
		for (const b of books) {
			console.log(`- ${b}`);
		}
		process.exit(0);
		break;
	}

	case "new-book":
	case "book:new":
	case "book:add":
	case "add-book": {
		process.exit(runScript("scaffold-book.ts", args.slice(1)));
		break;
	}

	case "remove-book":
	case "book:remove": {
		process.exit(runScript("remove-book.ts", args.slice(1)));
		break;
	}

	case "import":
	case "import-book":
	case "book:import": {
		process.exit(
			runScript("import-book-from-markdown.ts", withBookFlag(args.slice(1))),
		);
		break;
	}

	case "propose":
	case "proposal":
	case "propose-book": {
		process.exit(runScript("propose-book.ts", withBookFlag(args.slice(1))));
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
		const commands = [
			"status",
			"use",
			"new",
			"try",
			"check",
			"contract",
			"verify",
			"similar",
			"validate",
			"dev",
			"build",
			"deploy",
			"list",
			"import",
			"propose",
			"bets",
			"help",
		];
		console.error(
			`Unknown command "${command}".${didYouMean(command, commands)} Run bun run bookkit help for every command.`,
		);
		process.exit(1);
	}
}

async function printStatus() {
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
			`  ${s.book.padEnd(nameWidth)}  ${(title.length > titleWidth ? `${title.slice(0, titleWidth - 1)}…` : title).padEnd(titleWidth)}  ${s.status.padEnd(9)}  ${chapters} · ${s.mechanisms} mechanisms · ${s.tools} tools`,
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
		summaries.find((summary) => summary.book === focusBook) ??
		(summaries.length === 1 ? summaries[0] : undefined);
	const book = focus?.book ?? "<book>";
	const stub = focus?.stubChapters[0];
	const stubPath = stub
		? join("apps", book, "src", "content", "book", "chapters", stub)
		: undefined;
	const stubWords = stubPath
		? extractPageFacts(readFileSync(join(repoRoot(), stubPath), "utf8"))
				.wordCount
		: 0;
	const steps: Array<[string, string, string]> = [
		stubPath
			? ["write", stubPath, `the next stub (${stubWords} words so far)`]
			: [
					"write",
					`bun run bookkit new chapter ${book} "<title>"`,
					"start the next chapter",
				],
		[
			"check",
			`bun run bookkit check ${book}`,
			"errors to fix before anyone reads it",
		],
		[
			"preview",
			`bun run bookkit dev ${book}`,
			"the site in your browser; it updates as you save",
		],
		[
			"build",
			`bun run bookkit build ${book}`,
			`the site, PDF, and EPUB, in apps/${book}/dist`,
		],
		[
			"deploy",
			`bun run bookkit deploy ${book} --dry-run`,
			"checks, builds, and rehearses; drop --dry-run to publish to Cloudflare",
		],
	];
	console.log(
		focus
			? `\nYour book: ${book}${focus.book === focusBook ? "" : " (the only one)"}`
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
	const positional = rest.filter((arg) => !arg.startsWith("--"));
	const flag = (name: string) => {
		const index = rest.indexOf(name);
		return index >= 0 ? rest[index + 1] : undefined;
	};

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
			const usage = 'bun run bookkit new chapter [book] "<title>"';
			const [book, own] = takeBook(positional, 1, usage);
			const title = required(own[0], "Chapter title:", usage);
			const { fileName, slug } = nextChapterFileName(
				listChapterFiles(book),
				title,
			);
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
			writeFileSync(
				path,
				chapterSource({
					slug,
					title,
					mechanismSlugs: content.mechanisms.map((mechanism) => mechanism.slug),
				}),
			);
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
					`${holder.book} already has "${slug}". If this is the same idea, share it: copy ${holder.file ? relative(repoRoot(), holder.file) : `${holder.book}'s ${slug}.mdx`} into ${book}'s mechanisms folder (check:corpus keeps the copies identical). If it is a different idea, choose another title.`,
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
				"Domain (the setting, e.g. Housing):",
				usage,
			);
			const title = required(own[2], "Example title:", usage);
			process.exit(
				runScript("scaffold-example.ts", [
					"--book",
					book,
					"--mechanism",
					mechanism,
					"--domain",
					domain,
					"--title",
					title,
				]),
			);
			break;
		}

		case "book": {
			const slug = required(
				positional[0],
				"Book slug (lowercase-with-hyphens):",
				'bun run bookkit new book <slug> [--title "<title>"] [scaffold options]',
			);
			// --from <folder>: import a folder of notes once the book exists.
			const fromIndex = rest.indexOf("--from");
			const from = fromIndex >= 0 ? rest[fromIndex + 1] : undefined;
			if (fromIndex >= 0 && (!from || from.startsWith("--"))) {
				console.error(
					"--from needs a folder of Markdown notes: bun run bookkit new book <slug> --from <folder>",
				);
				process.exit(1);
			}
			const scaffoldArgs = rest
				.slice(1)
				.filter((_, index) => index !== fromIndex - 1 && index !== fromIndex);
			const created = runScript("scaffold-book.ts", [
				"--book",
				slug,
				...scaffoldArgs,
				...(from ? ["--no-next"] : []),
			]);
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
					`Cannot start "${resolvedKind}".${didYouMean(resolvedKind, ["chapter", "mechanism", "tool", "example", "book"])}`,
				);
			}
			console.error(`Usage: bun run bookkit new <chapter|mechanism|tool|example|book> ...

  new chapter [book] "<title>"                          next numbered chapter, draft
  new mechanism [book] "<title>" [--definition "…"]     checks every book for one that already fits
  new tool [book] <mechanism-slug> "<name>"             a ≤10-minute action for a mechanism
  new example [book] <mechanism-slug> <domain> "<title>"
  new book <slug> [--title "<title>"]

[book] defaults to the current one (bun run bookkit use <book>). At a terminal, anything left out is asked for.`);
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
 * running-hot`), or default to the current book (`bookkit use`).
 */
function withBookFlag(rest: string[]): string[] {
	if (rest.includes("--book")) return rest;
	if (rest[0] && !rest[0].startsWith("--")) {
		return ["--book", rest[0], ...rest.slice(1)];
	}
	return focusBook ? ["--book", focusBook, ...rest] : rest;
}

/** The value after a flag (`--frame runbook`), if given. */
function flagValue(list: string[], name: string): string | undefined {
	const index = list.indexOf(name);
	const value = index >= 0 ? list[index + 1] : undefined;
	return value && !value.startsWith("--") ? value : undefined;
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

async function checkOneFile(path: string, asJson: boolean, quick = false) {
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
	process.exit(result.ok ? 0 : 1);
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

/** The judge command: --run, else the environment's, unless --no-run. */
function judgeCommand(rest: string[]): string | undefined {
	if (rest.includes("--no-run")) return undefined;
	return (
		flagValue(rest, "--run") ??
		(process.env[JUDGE_COMMAND_ENV]?.trim() || undefined)
	);
}

/** How to have bookkit ask the judges itself. */
function judgeCommandHint(): string {
	return `To have bookkit ask them and record the answers: set ${JUDGE_COMMAND_ENV} to a command that reads a prompt on stdin and prints the reply (an LLM's command-line tool), or pass --run "<command>".`;
}

/**
 * Asks the judges in `folder` that have not answered, with `command`, then
 * records the answers once every judge has one.
 */
async function askAndRecord(folder: string, command: string): Promise<number> {
	const waiting = unansweredJudges(folder);
	if (waiting.length > 0) {
		console.log(
			`\nAsking ${waiting.length} judge(s), each on its own, with: ${command}`,
		);
		const results = await runJudges(folder, command);
		for (const result of results) {
			console.log(
				result.answer
					? `  ✓ judge ${result.judge} (${result.seconds}s)`
					: `  ✗ judge ${result.judge} (${result.seconds}s): ${result.error}`,
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
			const command = judgeCommand(rest);
			if (!command) {
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
			return askAndRecord(folder, command);
		}
		const found = named ? { folder: named } : newestAnswered();
		if ("error" in found) {
			console.error(found.error);
			return 1;
		}
		return runScript("check-corpus.ts", ["--judge-record", found.folder]);
	}
	const slug = rest[0] && !rest[0].startsWith("--") ? rest[0] : undefined;
	const passed = (name: string) => {
		const index = rest.indexOf(name);
		return index >= 0 && rest[index + 1] ? [name, rest[index + 1]] : [];
	};
	const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
	let folder = join(judgingDir(), `${slug ?? "corpus"}-${stamp}`);
	for (let n = 2; existsSync(folder); n += 1) {
		folder = join(judgingDir(), `${slug ?? "corpus"}-${stamp}-${n}`);
	}
	const command = judgeCommand(rest);
	const status = runScript("check-corpus.ts", [
		"--judge-prompt",
		folder,
		...(slug ? ["--judge-for", slug] : []),
		...passed("--judge-top"),
		...passed("--judges"),
		...(rest.includes("--quick") ? ["--no-semantic"] : []),
		...(rest.includes("--download-model") ? ["--download-model"] : []),
		...(command ? ["--asked-by", command] : []),
	]);
	// Nothing to judge writes no request.
	if (status !== 0 || !existsSync(join(folder, "key.json"))) return status;
	if (!command) {
		console.log(`\n${judgeCommandHint()}`);
		return 0;
	}
	return askAndRecord(folder, command);
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

/** bookkit sync <slug> [--from <book>]: one contract for every copy. */
function sync(rest: string[]): number {
	const [slug] = positionals(rest, ["--from"]);
	if (!slug) {
		console.error(
			"Usage: bun run bookkit sync <mechanism> [--from <book>] [--dry-run]\nCopies one copy's contract (default: the one edited last) to the mechanism's other books in its corpus.",
		);
		return 1;
	}
	const from = flagValue(rest, "--from");
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

function printHelp() {
	console.log(`Bookkit — write, check, preview, and publish books

Usage: bun run bookkit <command>       (no command: your books, and the commands to write, check,
                                       preview, build, and deploy one)

Start
  try <folder> [--frame <slug>] [--json]    what Bookkit would make of any folder of Markdown (writes nothing)
  use [book]                                pick the book you're working on; [book] below defaults to it
  new                                       asks what to start, then anything it needs

Write
  new chapter [book] "<title>"              start the next chapter as a draft
  new mechanism [book] "<title>" [--definition "…"]
                                            name a mechanism, after checking every book for one that fits
  new tool [book] <mechanism> "<name>"      a ≤10-minute action for a mechanism
  new example [book] <mechanism> <domain> "<title>"
  new book <slug> [--from <folder>]         a new book app; --from imports a folder of notes into it
  import [book] --dir <path> [--dry-run]    turn a folder of Markdown notes into chapters; --dry-run shows the plan
  propose [book] [--apply …]                draft mechanisms, tools, and config from a book's text

Check
  status [--json]                           chapters, stubs, mechanisms, and tools per book
  check [book] [--quick] [--download-model]
                                            structure, plus mechanisms that overlap across books; the
                                            meaning pass needs a 550 MB model, downloaded once with
                                            consent (--quick compares wording only)
  check <file.mdx> [--json] [--quick]       one content file: each finding with its field and fix; for a
                                            mechanism, similar ones, the judges' calls on it, and which of
                                            its 3 nearest have no verdict (--quick: nearest by wording)
  check <folder|file> [--frame <slug>] [--json] [--release]
                                            any Markdown, where it is: the content contract, plus each frame
                                            section once --frame is given; exits 1 on an error (for CI);
                                            --release checks it as a published book, so drafts are errors
  contract [section] [--json]               the fields a mechanism, tool, example, chapter, or glossary entry needs
  verify [--all] [--list] [--json]          the checks your change needs, judged by the files it touches
  judge [mechanism] [--judges 3] [--run "<command>"]
                                            ask judges, blind, whether close mechanisms are the same idea: one
                                            mechanism's 3 nearest without a verdict, or the corpus's flagged and
                                            closest pairs; writes a prompt per judge in .bookkit/judging/. With a
                                            judge command (--run, or BOOKKIT_JUDGE_COMMAND), asks each one and
                                            records the answers
  judge run [folder] [--run "<command>"]    ask the judges that have not answered (default: the newest request)
  judge record [folder]                     record answers saved by hand (default: the newest with answers)
  rule <a> <b> --distinct "<reason>"        rule two mechanisms different ideas, in corpus.json
  merge <keep> <drop> --reason "<why>" [--definition "…"] [--dry-run]
                                            rule them one idea: <drop> becomes <keep> in every book of the
                                            corpus (contract, files, links, config) and corpus.json records it
  sync <mechanism> [--from <book>]          copy one copy's contract (default: the one edited last) to the
                                            mechanism's other books
  similar "<title>" [--definition "…"] [--semantic]
                                            existing mechanisms, in any book, that a new one might duplicate
  validate [book]                           structure only

Preview and publish
  dev [book] [--port <n>]                   local preview with live reload; runs until stopped
  dev stop|status|logs [book]               control a dev server astro dev left in the background
  build [book] [--all]                      build one book (no book: the current one, or all)
  deploy [book...] [--all] [--dry-run] [--no-build]
                                            verify, build, and check each book, then publish all or none;
                                            no book: the current one, or all; --all for every book
                                            (bun run bookkit deploy --help for every option)

Other
  list                                      list the books
  remove-book --book <slug>                 delete a book app
  bets [--json]                             the maintainers' active bet (docs/bets.md), measured from git

Mistype a command, book, or mechanism and bookkit suggests the closest one.

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
