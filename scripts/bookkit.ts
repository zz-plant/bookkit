import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { shortBookTitle } from "../packages/astro-bookkit/src/seo/page-meta";
import { listBookDirs, repoRoot, slugify } from "./_lib";
import {
	booksWithMechanism,
	chapterSource,
	findSimilarMechanisms,
	findSimilarMechanismsByMeaning,
	listChapterFiles,
	nextChapterFileName,
	summarizeBook,
} from "./lib/authoring";
import { loadBookContent } from "./lib/load-book";

const args = process.argv.slice(2);
// No command: show where each book stands and what to run next.
const command = args[0] ?? "status";

if (command === "help" || command === "--help" || command === "-h") {
	printHelp();
	process.exit(0);
}

const books = listBookDirs();

/** Exits with a helpful message unless `book` is one of the workspace's books. */
const requireBook = (book: string | undefined, usage: string): string => {
	if (book && books.includes(book)) return book;
	console.error(
		book
			? `Book "${book}" not found. Available books: ${books.join(", ")}`
			: `Usage: ${usage}\nAvailable books: ${books.join(", ")}`,
	);
	process.exit(1);
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
				JSON.stringify(await Promise.all(books.map(summarizeBook)), null, 2),
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
			...(quick ? ["--no-semantic"] : []),
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

	case "dev": {
		const targetBook = args[1] || books[0];
		if (!targetBook) {
			console.error("No books found in apps/*");
			process.exit(1);
		}
		if (!books.includes(targetBook)) {
			console.error(
				`Book "${targetBook}" not found. Available books: ${books.join(", ")}`,
			);
			process.exit(1);
		}
		console.log(`\n🚀 Starting dev server for @books/${targetBook}...\n`);
		const result = spawnSync(
			"bun",
			["run", "--filter", `@books/${targetBook}`, "dev"],
			{
				stdio: "inherit",
			},
		);
		process.exit(result.status ?? 0);
		break;
	}

	case "build": {
		const targetBook = args[1];
		if (targetBook) {
			if (!books.includes(targetBook)) {
				console.error(
					`Book "${targetBook}" not found. Available books: ${books.join(", ")}`,
				);
				process.exit(1);
			}
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
		const targetBook = args[1];
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
		const passthrough = args.slice(1);
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
		const passthrough = args.slice(1);
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
		const targetBook =
			args[1] && !args[1].startsWith("--") ? args[1] : undefined;
		const dryRun = args.includes("--dry-run");
		const skipBuild = args.includes("--no-build");

		if (targetBook && !books.includes(targetBook)) {
			console.error(
				`Book "${targetBook}" not found. Available books: ${books.join(", ")}`,
			);
			process.exit(1);
		}

		const wranglerBin = join(process.cwd(), "node_modules", ".bin", "wrangler");
		if (!existsSync(wranglerBin)) {
			console.error(
				"wrangler is not installed. Run `bun install`; it is a workspace devDependency.",
			);
			process.exit(1);
		}

		for (const book of targetBook ? [targetBook] : books) {
			const appDir = join(process.cwd(), "apps", book);

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

	default:
		console.error(`Unknown command: ${command}`);
		printHelp();
		process.exit(1);
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
	const first = books[0] ?? "<book>";
	const next: Array<[string, string]> = [
		[`bun run bookkit dev ${first}`, "preview a book in the browser"],
		[`bun run bookkit new chapter ${first} "<title>"`, "start a chapter"],
		["bun run bookkit check [book]", "find what to fix before sharing"],
		["bun run bookkit help", "every command"],
	];
	const width = Math.max(...next.map(([cmd]) => cmd.length));
	console.log("\nNext");
	for (const [cmd, what] of next)
		console.log(`  ${cmd.padEnd(width)}   ${what}`);
	console.log("");
}

function createNew(kind: string | undefined, rest: string[]) {
	const positional = rest.filter((arg) => !arg.startsWith("--"));
	const flag = (name: string) => {
		const index = rest.indexOf(name);
		return index >= 0 ? rest[index + 1] : undefined;
	};

	switch (kind) {
		case "chapter": {
			const usage = 'bun run bookkit new chapter <book> "<title>"';
			const book = requireBook(positional[0], usage);
			const title = positional[1];
			if (!title) {
				console.error(`Usage: ${usage}`);
				process.exit(1);
			}
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
				'bun run bookkit new mechanism <book> "<title>" [--definition "<one sentence>"] [--force]';
			const book = requireBook(positional[0], usage);
			const title = positional[1];
			if (!title) {
				console.error(`Usage: ${usage}`);
				process.exit(1);
			}
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
			const similar = findSimilarMechanisms({
				title,
				definition: flag("--definition"),
			});
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
			const usage = 'bun run bookkit new tool <book> <mechanism-slug> "<name>"';
			const book = requireBook(positional[0], usage);
			const [, mechanism, name] = positional;
			if (!mechanism || !name) {
				console.error(`Usage: ${usage}`);
				process.exit(1);
			}
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
				'bun run bookkit new example <book> <mechanism-slug> <domain> "<title>"';
			const book = requireBook(positional[0], usage);
			const [, mechanism, domain, title] = positional;
			if (!mechanism || !domain || !title) {
				console.error(`Usage: ${usage}`);
				process.exit(1);
			}
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
			const slug = positional[0];
			if (!slug) {
				console.error(
					'Usage: bun run bookkit new book <slug> [--title "<title>"] [scaffold options]',
				);
				process.exit(1);
			}
			process.exit(
				runScript("scaffold-book.ts", ["--book", slug, ...rest.slice(1)]),
			);
			break;
		}

		default: {
			console.error(`Usage: bun run bookkit new <chapter|mechanism|tool|example|book> ...

  new chapter <book> "<title>"                          next numbered chapter, draft
  new mechanism <book> "<title>" [--definition "…"]     checks every book for one that already fits
  new tool <book> <mechanism-slug> "<name>"             a ≤10-minute action for a mechanism
  new example <book> <mechanism-slug> <domain> "<title>"
  new book <slug> [--title "<title>"]`);
			process.exit(1);
		}
	}
}

function printHelp() {
	console.log(`Bookkit — write, check, preview, and publish books

Usage: bun run bookkit <command>       (no command: where each book stands)

Write
  new chapter <book> "<title>"              start the next chapter as a draft
  new mechanism <book> "<title>"            name a mechanism, after checking every book for one that fits
  new tool <book> <mechanism> "<name>"      a ≤10-minute action for a mechanism
  new example <book> <mechanism> <domain> "<title>"
  new book <slug>                           a new book app
  import --book <slug> --dir <path>         bring markdown chapters into a book
  propose --book <slug> [--apply …]         draft mechanisms, tools, and config from a book's text

Check
  status [--json]                           chapters, stubs, mechanisms, and tools per book
  check [book] [--quick]                    structure, plus mechanisms that overlap across books
  verify [--all] [--list] [--json]          the checks your change needs, judged by the files it touches
  similar "<title>" [--definition "…"] [--semantic]
                                            existing mechanisms, in any book, that a new one might duplicate
  validate [book]                           structure only

Preview and publish
  dev [book]                                local preview with live reload
  build [book]                              build one book or all of them
  deploy [book] [--dry-run] [--no-build]    build, verify dist/, publish to Cloudflare

Other
  list                                      list the books
  remove-book --book <slug>                 delete a book app

Examples
  bun run bookkit
  bun run bookkit new chapter running-hot "Repair has a clock"
  bun run bookkit new mechanism bad-people "Waiting as leverage"
  bun run bookkit check running-hot
  bun run bookkit dev running-hot
  bun run bookkit deploy on-call --dry-run
`);
}
