import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { extractPageFacts } from "../packages/astro-bookkit/src/markdown/pageFacts";
import { shortBookTitle } from "../packages/astro-bookkit/src/seo/page-meta";
import { checkBookContent } from "../packages/astro-bookkit/src/validators/book-validator";
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
	loadBookConfigSummary,
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
	readFocusBook,
	writeFocusBook,
} from "./lib/cli";
import { domainNotice } from "./lib/deploy-domain";
import { DEFAULT_DEV_PORT, runDevServer } from "./lib/dev-server";
import {
	isBookContentPath,
	printFolderCheck,
	printTry,
	readFolder,
	resolveFromCaller,
	runPreview,
} from "./lib/folder-report";
import { loadBookContent } from "./lib/load-book";

const args = process.argv.slice(2);
// No command: show where each book stands and what to run next.
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

const runScript = (script: string, scriptArgs: string[]): number =>
	spawnSync(
		process.execPath,
		["run", join(repoRoot(), "scripts", script), ...scriptArgs],
		{ stdio: "inherit" },
	).status ?? 1;

switch (command) {
	case "status": {
		if (args.includes("--json")) {
			console.log(
				JSON.stringify(
					{
						books: await Promise.all(books.map(summarizeBook)),
						b1: await buildB1Report(),
					},
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
			checkOneFile(args[1], args.includes("--json"));
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
				"  → For each cluster above: make it one mechanism, or rule the pair distinct in corpus.json.",
			);
		}
		process.exit(structure === 0 && corpus === 0 ? 0 : 1);
		break;
	}

	case "new": {
		createNew(args[1], args.slice(2));
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
			process.exit(result.status ?? 0);
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
				"bun",
				["run", "--filter", `@books/${targetBook}`, "build"],
				{
					stdio: "inherit",
				},
			);
			process.exit(result.status ?? 0);
		} else {
			console.log("\n📦 Building all workspace books...\n");
			const result = spawnSync("bun", ["run", "--workspaces", "build"], {
				stdio: "inherit",
			});
			process.exit(result.status ?? 0);
		}
		break;
	}

	case "validate": {
		const targetBook =
			args[1] && !args[1].startsWith("--")
				? requireBook(args[1], "bun run bookkit validate [book]")
				: undefined;
		if (targetBook) {
			const scriptPath = join(process.cwd(), "scripts", "validate-book.ts");
			const result = spawnSync(
				process.execPath,
				["run", scriptPath, "--book", targetBook, ...args.slice(2)],
				{
					stdio: "inherit",
				},
			);
			process.exit(result.status ?? 0);
		} else {
			const scriptPath = join(process.cwd(), "scripts", "validate-all.ts");
			const result = spawnSync(
				process.execPath,
				["run", scriptPath, ...args.slice(1)],
				{
					stdio: "inherit",
				},
			);
			process.exit(result.status ?? 0);
		}
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
		const passthrough = args.slice(1);
		const scriptPath = join(process.cwd(), "scripts", "scaffold-book.ts");
		const result = spawnSync(
			process.execPath,
			["run", scriptPath, ...passthrough],
			{
				stdio: "inherit",
			},
		);
		process.exit(result.status ?? 1);
		break;
	}

	case "remove-book":
	case "book:remove": {
		const passthrough = args.slice(1);
		const scriptPath = join(process.cwd(), "scripts", "remove-book.ts");
		const result = spawnSync(
			process.execPath,
			["run", scriptPath, ...passthrough],
			{
				stdio: "inherit",
			},
		);
		process.exit(result.status ?? 1);
		break;
	}

	case "import":
	case "import-book":
	case "book:import": {
		const passthrough = withBookFlag(args.slice(1));
		const scriptPath = join(
			process.cwd(),
			"scripts",
			"import-book-from-markdown.ts",
		);
		const result = spawnSync(
			process.execPath,
			["run", scriptPath, ...passthrough],
			{
				stdio: "inherit",
			},
		);
		process.exit(result.status ?? 1);
		break;
	}

	case "propose":
	case "proposal":
	case "propose-book": {
		const passthrough = withBookFlag(args.slice(1));
		const scriptPath = join(process.cwd(), "scripts", "propose-book.ts");
		const result = spawnSync(
			process.execPath,
			["run", scriptPath, ...passthrough],
			{
				stdio: "inherit",
			},
		);
		process.exit(result.status ?? 1);
		break;
	}

	case "deploy": {
		const target = targetBooks(
			args,
			"bun run bookkit deploy [book] [--all] [--dry-run]",
		);
		const dryRun = args.includes("--dry-run");
		const skipBuild = args.includes("--no-build");
		console.log(
			`${dryRun ? "Dry run for" : "Deploying"} ${target.books.join(", ")}.${target.note ? ` ${target.note}` : ""}`,
		);

		const wranglerBin = join(process.cwd(), "node_modules", ".bin", "wrangler");
		if (!existsSync(wranglerBin)) {
			console.error(
				"wrangler is not installed. Run `bun install`; it is a workspace devDependency.",
			);
			process.exit(1);
		}

		for (const book of target.books) {
			const appDir = join(process.cwd(), "apps", book);

			// The content check verify runs per book. A build renders invalid
			// content without complaint, so this is what keeps it off the host.
			const content = checkBookContent({
				workspaceRoot: process.cwd(),
				bookSlug: book,
			});
			const contentErrors = content.findings.filter(
				(finding) => finding.level === "error",
			);
			console.log(
				`\nCONTENT ${book}: ${content.ok ? "ok" : "failed"} (${contentErrors.length} error(s), ${content.findings.length - contentErrors.length} warning(s))`,
			);
			for (const finding of contentErrors) {
				const where = finding.file
					? `${relative(process.cwd(), finding.file)}: `
					: "";
				console.log(`- [error] ${where}${finding.message}`);
				if (finding.fix)
					console.log(`  fix: ${finding.fix.replace(/\n/g, "\n  ")}`);
			}
			if (!content.ok) {
				console.error(
					`\nRefusing to deploy ${book}: its content failed validation.`,
				);
				process.exit(1);
			}

			if (!skipBuild) {
				console.log(`\n📦 Building @books/${book}...\n`);
				const build = spawnSync(
					"bun",
					["run", "--filter", `@books/${book}`, "build"],
					{ stdio: "inherit" },
				);
				if (build.status !== 0) process.exit(build.status ?? 1);
			}

			const check = spawnSync(
				process.execPath,
				[
					"run",
					join(process.cwd(), "scripts", "check-build.ts"),
					"--book",
					book,
				],
				{ stdio: "inherit" },
			);
			if (check.status !== 0) {
				console.error(
					`\nRefusing to deploy ${book}: its build output failed verification.`,
				);
				process.exit(check.status ?? 1);
			}

			const wranglerConfig = join(appDir, "wrangler.jsonc");
			const notice = existsSync(wranglerConfig)
				? domainNotice({
						book,
						siteUrl: (await loadBookConfigSummary(book)).site?.url,
						wranglerJsonc: readFileSync(wranglerConfig, "utf8"),
					})
				: null;
			if (notice) console.log(`\nNote for ${book}: ${notice}`);

			console.log(
				`\n🚀 Deploying @books/${book} to Cloudflare${dryRun ? " (dry run)" : ""}...\n`,
			);
			const deploy = spawnSync(
				wranglerBin,
				["deploy", ...(dryRun ? ["--dry-run"] : [])],
				{ cwd: appDir, stdio: "inherit" },
			);
			if (deploy.status !== 0) process.exit(deploy.status ?? 1);
		}
		process.exit(0);
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
			"help",
		];
		console.error(
			`Unknown command "${command}".${didYouMean(command, commands)} Run bun run bookkit help for every command.`,
		);
		process.exit(1);
	}
}

async function printStatus() {
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
	const b1 = await buildB1Report();
	if ("unavailable" in b1) {
		console.log(`\n  B1: not measured (${b1.unavailable}).`);
	} else {
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
	}
	// Next steps name real files: the current book's first stub, if any.
	const focus = summaries.find((summary) => summary.book === focusBook);
	const stub = focus?.stubChapters[0];
	const stubPath = stub
		? join("apps", focus.book, "src", "content", "book", "chapters", stub)
		: undefined;
	const stubWords = stubPath
		? extractPageFacts(readFileSync(join(repoRoot(), stubPath), "utf8"))
				.wordCount
		: 0;
	const next: Array<[string, string]> = focus
		? [
				...(stubPath
					? ([
							[
								`write ${stubPath}`,
								`the next stub (${stubWords} words so far)`,
							],
							[`bun run bookkit check ${stubPath}`, "what it still needs"],
						] as Array<[string, string]>)
					: []),
				[
					'bun run bookkit new chapter "<title>"',
					`start a chapter in ${focus.book}`,
				],
				["bun run bookkit dev", `preview ${focus.book} in the browser`],
				["bun run verify", "the checks your change needs, before you commit"],
			]
		: [
				[
					"bun run bookkit use <book>",
					"pick the book you're working on; commands default to it",
				],
				[
					"bun run bookkit new",
					"start a chapter, mechanism, tool, or example (asks what it needs)",
				],
				["bun run bookkit check [book]", "find what to fix before sharing"],
				[
					"bun run bookkit try <folder>",
					"see what Bookkit would make of your own docs (writes nothing)",
				],
				["bun run bookkit help", "every command"],
			];
	if (focus) console.log(`\nCurrent book: ${focus.book}`);
	// Short commands share a column; a long one puts its note on the next line.
	const width = Math.min(40, Math.max(...next.map(([cmd]) => cmd.length)));
	console.log("\nNext");
	for (const [cmd, what] of next) {
		console.log(
			cmd.length > width
				? `  ${cmd}\n  ${" ".repeat(width)}   ${what}`
				: `  ${cmd.padEnd(width)}   ${what}`,
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
				console.log(
					`\nIf one fits, bind its slug in the chapter instead. If not, rerun with --force to create "${slug}".`,
				);
				process.exit(1);
			}
			const status = runScript("scaffold-mechanism.ts", [
				"--book",
				book,
				"--slug",
				slug,
				"--title",
				title,
			]);
			if (status === 0) {
				console.log(
					"Then run bun run bookkit check: once the definition is written, it compares meaning across every book.",
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
			process.exit(
				runScript("scaffold-book.ts", ["--book", slug, ...rest.slice(1)]),
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

function checkOneFile(path: string, asJson: boolean) {
	const checked = checkContentFile(path);
	if ("error" in checked) {
		console.error(checked.error);
		process.exit(1);
	}
	const { book, section, result } = checked;
	// A mechanism file also gets the duplicate check `new mechanism` runs.
	const similar =
		section === "mechanism"
			? similarForMechanismFile(result.frontmatter, book)
			: [];
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
			"    Same idea: bind that slug instead. Different: rule the pair distinct in corpus.json.",
		);
	}
	if (elsewhere.length > 0) {
		console.log(
			`  similar wording in books outside ${book}'s corpus (for information; nothing to change):`,
		);
		for (const match of elsewhere) console.log(describe(match));
	}
	process.exit(result.ok ? 0 : 1);
}

function printHelp() {
	console.log(`Bookkit — write, check, preview, and publish books

Usage: bun run bookkit <command>       (no command: where each book stands, and what to do next)

Start
  try <folder> [--frame <slug>] [--json]    what Bookkit would make of any folder of Markdown (writes nothing)
  use [book]                                pick the book you're working on; [book] below defaults to it
  new                                       asks what to start, then anything it needs

Write
  new chapter [book] "<title>"              start the next chapter as a draft
  new mechanism [book] "<title>"            name a mechanism, after checking every book for one that fits
  new tool [book] <mechanism> "<name>"      a ≤10-minute action for a mechanism
  new example [book] <mechanism> <domain> "<title>"
  new book <slug>                           a new book app
  import [book] --dir <path>                bring markdown chapters into a book (converted to compile as MDX)
  propose [book] [--apply …]                draft mechanisms, tools, and config from a book's text

Check
  status [--json]                           chapters, stubs, mechanisms, and tools per book
  check [book] [--quick] [--download-model]
                                            structure, plus mechanisms that overlap across books; the
                                            meaning pass needs a 550 MB model, downloaded once with
                                            consent (--quick compares wording only)
  check <file.mdx> [--json]                 one content file: each finding with its field and fix
  check <folder|file> [--frame <slug>] [--json] [--release]
                                            any Markdown, where it is: the content contract, plus each frame
                                            section once --frame is given; exits 1 on an error (for CI)
  contract [section] [--json]               the fields a mechanism, tool, example, chapter, or glossary entry needs
  verify [--all] [--list] [--json]          the checks your change needs, judged by the files it touches
  similar "<title>" [--definition "…"] [--semantic]
                                            existing mechanisms, in any book, that a new one might duplicate
  validate [book]                           structure only

Preview and publish
  dev [book] [--port <n>]                   local preview with live reload; runs until stopped
  dev stop|status|logs [book]               control a dev server astro dev left in the background
  build [book] [--all]                      build one book (no book: the current one, or all)
  deploy [book] [--all] [--dry-run] [--no-build]
                                            check content, build, verify dist/, publish to Cloudflare;
                                            no book: the current one, or all; --all for every book

Other
  list                                      list the books
  remove-book --book <slug>                 delete a book app

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
