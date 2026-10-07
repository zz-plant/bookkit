import { join } from "node:path";
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

const mdx = `---
slug: ${slug}
title: ${title}
definition: ""
is:
  - ""
isNot:
  - ""
predictions:
  - ""
tests:
  - ""
---

<!-- Optional prose: examples, notes, citations. Keep definition/boundaries above truthful and stable. -->
`;

writeFileSafe(outPath, mdx);
console.log(`Created mechanism: ${outPath}`);
console.log(
	`Next: add 1–3 real predictions + at least one test, then run: bun run validate`,
);
