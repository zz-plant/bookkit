import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { listBookDirs } from "./_lib";

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === "--help" || command === "-h") {
	printHelp();
	process.exit(command ? 0 : 1);
}

const books = listBookDirs();

switch (command) {
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

function printHelp() {
	console.log(`Bookkit CLI — Unified Workspace Task Runner

Usage:
  bun run bookkit <command> [options]

Commands:
  dev [book]              Run Astro dev server (defaults to primary book)
  build [book]            Build one book or all books
  deploy [book] [--dry-run] [--no-build]
                          Build, verify dist/, and publish to Cloudflare Workers static assets
  validate [book]         Run validation on a book or all books
  list                    List all active books
  new-book -- --book <slug> [options]  Scaffold a new book app
  remove-book -- --book <slug>         Remove a book app
  import -- --book <slug> --dir <path> Import markdown into a book's chapter layer
  propose -- --book <slug> [options]   Build + apply a proposal bundle (mechanisms, tools, config draft)

Examples:
  bun run bookkit dev bad-people
  bun run bookkit build
  bun run bookkit deploy on-call --dry-run
  bun run bookkit validate running-hot
  bun run bookkit import --book docs --dir ./notes
  bun run bookkit propose --book docs --apply mechanisms --apply tools
`);
}
