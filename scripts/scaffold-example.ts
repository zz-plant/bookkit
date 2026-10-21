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
	{
		summary:
			"Creates a draft example in\napps/<book>/src/content/book/examples/<mechanism>/.",
		usage: [
			'bun run new:example -- --book <book> --mechanism <mechanism-slug> --domain <domain> [--title "<title>"]',
		],
		options: [
			["--book <book>", "The book app to add it to"],
			["--mechanism <slug>", "The mechanism the example illustrates"],
			["--domain <domain>", "The setting, e.g. Housing"],
			['--title "<title>"', 'The example\'s title (default: "Example")'],
		],
		notes:
			"bun run bookkit new example does the same, and asks for what is left out.",
		examples: [
			'bun run new:example -- --book bad-people --mechanism delay-as-force --domain Housing --title "The repair request"',
		],
	},
	{ book: "string", mechanism: "string", domain: "string", title: "string" },
	["book", "mechanism", "domain"],
);

const { book, mechanism, domain } = args;
requireExistingBook(book, listBookDirs());
requireExistingMechanism(
	book,
	mechanism,
	loadBookContent(book).mechanisms.map((record) => record.slug),
);
const titleRaw = args.title ?? "Example";

const slug = slugify(`${domain}-${titleRaw}`);

const outDir = join(
	process.cwd(),
	"apps",
	book,
	"src",
	"content",
	"book",
	"examples",
	mechanism,
);
ensureDir(outDir);

const outPath = join(outDir, `${slug}.mdx`);

const mdx = scaffoldSource(
	"example",
	{ mechanism, domain, title: titleRaw, status: "draft" },
	"Write the example here. Do not define the mechanism or introduce new primary concepts; keep it swappable, so replacing it leaves the mechanism standing.",
);

writeFileSafe(outPath, mdx);
console.log(`Created example: ${outPath}`);
