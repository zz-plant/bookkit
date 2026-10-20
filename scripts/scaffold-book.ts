import { spawnSync } from "node:child_process";
import { repoRoot, slugify } from "./_lib";
import { parseScriptArgs } from "./lib/cli";
import {
	formatWithBiome,
	scaffoldBook,
	titleFromSlug,
} from "./lib/scaffold-book";

const USAGE = `Create a book app in apps/<slug> from the engine's starter template.

Usage:
  bun run new:book -- --book <slug> [--title "<title>"] [--frame <slug>] [--skip-starter-content] [--no-install]

Options:
  --book <slug>             The book's slug: lowercase words joined by hyphens
  --title "<title>"         The book's title (default: from the slug)
  --frame <slug>            The book's frame: intervention (default), explainer,
                            field-guide, or runbook (bookkit try names the one
                            a folder of notes reads as)
  --skip-starter-content    Leave the content folders empty
  --no-install              Skip the bun install that links the app and adds it to bun.lock
  --no-next                 Leave out the next steps (bookkit new book --from imports right after)
  -h, --help                Show this help

The app gets the starter pages (packages/astro-bookkit/templates/starter/), the
wrappers every book shares (templates/book-app/), and placeholder content.`;

const args = parseScriptArgs(
	USAGE,
	{
		book: "string",
		title: "string",
		frame: "string",
		"skip-starter-content": "boolean",
		"no-install": "boolean",
		"no-next": "boolean",
	},
	["book"],
);

const slug = slugify(args.book);
if (!slug) {
	console.error(
		`--book "${args.book}" has no letters or digits to make a slug from. Use lowercase words joined by hyphens, e.g. --book field-notes.`,
	);
	process.exit(1);
}
if (slug !== args.book) {
	console.warn(`Using the slug "${slug}" for "${args.book}".`);
}

const root = repoRoot();
let files: string[];
try {
	({ files } = scaffoldBook({
		root,
		slug,
		title: args.title ?? titleFromSlug(slug),
		skipStarterContent: args["skip-starter-content"],
		frame: args.frame,
	}));
	const warning = formatWithBiome(
		root,
		files.filter((file) => /\.(ts|json|jsonc|astro|mjs)$/.test(file)),
	);
	if (warning) console.warn(warning);
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}

console.log(`Created apps/${slug} (${files.length} files).`);

// The new workspace must be in bun.lock (CI installs with --frozen-lockfile)
// and linked before it can build.
const installed =
	!args["no-install"] &&
	spawnSync(process.execPath, ["install"], { cwd: root, stdio: "inherit" })
		.status === 0;
if (!args["no-install"] && !installed) {
	console.warn(
		"bun install failed. Run it before building, and commit the bun.lock change with the new book.",
	);
}

if (!args["no-next"])
	console.log(`Next:${installed ? "" : `\n  bun install                              link the app and add it to bun.lock`}
  edit apps/${slug}/src/book.config.ts      title, site.url, objectives
  bun run bookkit dev ${slug}               preview it
  bun run bookkit check ${slug}             what the placeholder content still needs`);
