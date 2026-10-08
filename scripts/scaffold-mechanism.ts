import { join } from "node:path";
import { scaffoldSource } from "../packages/astro-bookkit/src/validators/content-check";
import {
	ensureDir,
	optionalArg,
	requireArg,
	slugify,
	writeFileSafe,
} from "./_lib";

const book = requireArg("--book");
const slugRaw = requireArg("--slug");
const title = optionalArg("--title") ?? slugRaw;
const slug = slugify(slugRaw);

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
