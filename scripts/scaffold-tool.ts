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
const nameRaw = optionalArg("--name") ?? "New tool";
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
