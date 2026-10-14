import { join } from "node:path";
import { scaffoldSource } from "../packages/astro-bookkit/src/validators/content-check";
import { ensureDir, listBookDirs, slugify, writeFileSafe } from "./_lib";
import {
	parseScriptArgs,
	requireExistingBook,
	requireExistingMechanism,
} from "./lib/cli";
import { loadBookContent } from "./lib/load-book";

const args = parseScriptArgs(
	`Create a draft toolkit action in apps/<book>/src/content/book/toolkit/.

Usage:
  bun run new:tool -- --book <book> --mechanism <mechanism-slug> [--name "<name>"]

Options:
  --book <book>             The book app to add it to
  --mechanism <slug>        The mechanism the action responds to
  --name "<name>"           The action's name (default: "New tool")
  -h, --help                Show this help`,
	{ book: "string", mechanism: "string", name: "string" },
	["book", "mechanism"],
);

const { book, mechanism } = args;
requireExistingBook(book, listBookDirs());
requireExistingMechanism(
	book,
	mechanism,
	loadBookContent(book).mechanisms.map((record) => record.slug),
);
const nameRaw = args.name ?? "New tool";
const toolSlug = slugify(`${mechanism}--${nameRaw}`);

const outDir = join(
	process.cwd(),
	"apps",
	book,
	"src",
	"content",
	"book",
	"toolkit",
);
ensureDir(outDir);

const outPath = join(outDir, `${toolSlug}.mdx`);

const mdx = scaffoldSource(
	"tool",
	{
		slug: toolSlug,
		mechanism,
		name: nameRaw,
		timeboxMinutes: 10,
		status: "draft",
	},
	"Optional notes. Tools must be runnable by a depleted person. No heroics.",
);

writeFileSafe(outPath, mdx);
console.log(`Created tool: ${outPath}`);
console.log(
	`Next: fill trigger, steps, failureLooksLike, and legitimateDemand. bun run bookkit check ${outPath} says what each needs.`,
);
