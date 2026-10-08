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
const mechanism = requireArg("--mechanism");
const domain = requireArg("--domain");
const titleRaw = optionalArg("--title") ?? "Example";

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
