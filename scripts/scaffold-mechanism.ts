import { join } from "node:path";
import { scaffoldSource } from "../packages/astro-bookkit/src/validators/content-check";
import { ensureDir, listBookDirs, slugify, writeFileSafe } from "./_lib";
import { parseScriptArgs, requireExistingBook } from "./lib/cli";

const args = parseScriptArgs(
	{
		summary:
			"Creates a draft mechanism in apps/<book>/src/content/book/mechanisms/.",
		usage: [
			'bun run new:mechanism -- --book <book> --slug <slug> [--title "<title>"] [--definition "<one sentence>"]',
		],
		options: [
			["--book <book>", "The book app to add it to"],
			["--slug <slug>", "The mechanism's durable identifier"],
			['--title "<title>"', "Its title as readers see it (default: the slug)"],
			['--definition "<sentence>"', "What it is, in one sentence"],
		],
		notes:
			"bun run bookkit new mechanism also checks every book for a mechanism\nthat already fits.",
		examples: [
			'bun run new:mechanism -- --book bad-people --slug waiting-as-leverage --title "Waiting as leverage"',
		],
	},
	{ book: "string", slug: "string", title: "string", definition: "string" },
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
	{
		slug,
		title,
		status: "draft",
		definition: args.definition?.trim() || undefined,
	},
	"Optional prose: examples, notes, citations. Keep the definition and boundaries above truthful and stable.",
);

writeFileSafe(outPath, mdx);
console.log(`Created mechanism: ${outPath}`);
console.log(
	`Next: ${args.definition ? "" : "write the definition, "}add 1–3 real predictions and at least one test. bun run bookkit check ${outPath} says what each field needs.`,
);
