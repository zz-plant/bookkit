import { join } from "node:path";
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

const mdx = `---
mechanism: ${mechanism}
domain: ${domain}
title: "${titleRaw}"
status: draft
---

Write the example.

Constraints:
- Do not define the mechanism here.
- Do not introduce new primary concepts.
- Make it swappable: if someone replaces this example, the mechanism still stands.
`;

writeFileSafe(outPath, mdx);
console.log(`Created example: ${outPath}`);
