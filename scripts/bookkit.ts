import { spawnSync } from "node:child_process";
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
  validate [book]         Run validation on a book or all books
  list                    List all active books
  new-book -- --book <slug> [options]  Scaffold a new book app
  remove-book -- --book <slug>         Remove a book app

Examples:
  bun run bookkit dev bad-people
  bun run bookkit build
  bun run bookkit validate running-hot
`);
}
