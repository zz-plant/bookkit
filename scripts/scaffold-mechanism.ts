import { join } from "node:path";
import { scaffoldSource } from "../packages/astro-bookkit/src/validators/content-check";
import { ensureDir, listBookDirs, slugify, writeFileSafe } from "./_lib";
import { parseScriptArgs, requireExistingBook } from "./lib/cli";

const args = parseScriptArgs(
	`Create a draft mechanism in apps/<book>/src/content/book/mechanisms/.

Usage:
  bun run new:mechanism -- --book <book> --slug <slug> [--title "<title>"]

Options:
  --book <book>       The book app to add it to
  --slug <slug>       The mechanism's durable identifier
  --title "<title>"   Its title as readers see it (default: the slug)
  -h, --help          Show this help

bun run bookkit new mechanism also checks every book for a mechanism that already fits.`,
	{ book: "string", slug: "string", title: "string" },
	["book", "slug"],
);

const { book } = args;
requireExistingBook(book, listBookDirs());
const slug = slugify(args.slug);
const title = args.title ?? args.slug;

const outDir = join(
	process.cwd(),
	"apps",
	book,
	"src",
	"content",
	"book",
	"mechanisms",
);
ensureDir(outDir);

const outPath = join(outDir, `${slug}.mdx`);

const mdx = scaffoldSource(
	"mechanism",
	{ slug, title, status: "draft" },
	"Optional prose: examples, notes, citations. Keep the definition and boundaries above truthful and stable.",
);

writeFileSafe(outPath, mdx);
console.log(`Created mechanism: ${outPath}`);
console.log(
	`Next: add 1–3 real predictions and at least one test. bun run bookkit check ${outPath} says what each field needs.`,
);
