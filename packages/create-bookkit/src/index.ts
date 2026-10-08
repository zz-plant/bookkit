#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

const here = import.meta.dir;
const repoRoot = join(here, "../../..");
const engineDir = join(repoRoot, "packages", "astro-bookkit");
const templateSurface = join(engineDir, "templates", "book-app", "src");
const starterApp = join(repoRoot, "apps", "bad-people");

const argValue = (name: string): string | undefined => {
	const i = process.argv.indexOf(name);
	return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : undefined;
};

const titleize = (slug: string): string =>
	slug
		.split("-")
		.map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
		.join(" ");

const targetDir = resolve(process.argv[2] ?? ".");
const bookSlug = argValue("--book") ?? "guide";
const title = argValue("--title") ?? titleize(bookSlug);
const markdownDir = argValue("--dir");
const force = process.argv.includes("--force");

const copyTree = (from: string, to: string, exclude?: RegExp): void => {
	cpSync(from, to, {
		recursive: true,
		filter: (src) => (exclude ? !exclude.test(src) : true),
	});
};

const write = (file: string, content: string): void => {
	mkdirSync(join(file, ".."), { recursive: true });
	writeFileSync(file, content, "utf8");
};

const fail = (message: string): never => {
	console.error(`✗ ${message}`);
	process.exit(1);
};

if (!existsSync(engineDir))
	fail(`Engine not found at ${engineDir}. Run from the bookkit repo.`);
if (!existsSync(starterApp)) fail(`Starter app not found at ${starterApp}.`);
if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });
if (existsSync(join(targetDir, "package.json")) && !force) {
	fail(
		`Target already has a package.json (${targetDir}). Use --force to overwrite.`,
	);
}

if (existsSync(join(targetDir, "apps", bookSlug)) && !force) {
	fail(
		`apps/${bookSlug} already exists in the target. Use --force to overwrite.`,
	);
}
const appDir = join(targetDir, "apps", bookSlug);

console.log(`Scaffolding bookkit project at ${targetDir}`);

if (force) {
	rmSync(join(targetDir, "packages"), { recursive: true, force: true });
	rmSync(join(targetDir, "scripts"), { recursive: true, force: true });
	rmSync(appDir, { recursive: true, force: true });
}
rmSync(join(targetDir, "apps", "scratch-import"), {
	recursive: true,
	force: true,
});

copyTree(
	engineDir,
	join(targetDir, "packages", "astro-bookkit"),
	/(node_modules|\/\.astro|\/dist)(\/|$)/,
);
const vendoredPkgPath = join(
	targetDir,
	"packages",
	"astro-bookkit",
	"package.json",
);
const vendoredPkg = JSON.parse(readFileSync(vendoredPkgPath, "utf8"));
if (vendoredPkg.optionalDependencies) {
	delete vendoredPkg.optionalDependencies;
	vendoredPkg.description = `${vendoredPkg.description} (vendored by create-bookkit)`;
	writeFileSync(
		vendoredPkgPath,
		`${JSON.stringify(vendoredPkg, null, 2)}\n`,
		"utf8",
	);
}

mkDir(appDir);
for (const entry of [
	"package.json",
	"astro.config.mjs",
	"tsconfig.json",
	"wrangler.jsonc",
	"public",
	"src",
]) {
	cpSync(join(starterApp, entry), join(appDir, entry), { recursive: true });
}
rmSync(join(appDir, "src", "content", "book"), {
	recursive: true,
	force: true,
});
copyTree(templateSurface, join(appDir, "src"));

const contentRoot = join(appDir, "src", "content", "book");
for (const dir of [
	"chapters",
	"examples",
	"mechanisms",
	"releases",
	"toolkit",
	"glossary",
]) {
	mkdirSync(join(contentRoot, dir), { recursive: true });
}
writeStarterContent(contentRoot, { title });
writeConfig(join(appDir, "src", "book.config.ts"), { bookSlug, title });
writeAppPackageJson(join(appDir, "package.json"), { bookSlug });
rewriteWorkerName(join(appDir, "wrangler.jsonc"), { bookSlug });

for (const rel of [
	"tsconfig.base.json",
	".gitignore",
	"package.json",
	"README.md",
]) {
	writeProjectRootFile(targetDir, rel, { bookSlug, title });
}

for (const rel of [
	"_lib.ts",
	"lib/content-frontmatter.ts",
	"import-book-from-markdown.ts",
	"check-suggestions.ts",
	"check-runbooks.ts",
]) {
	const srcPath = join(repoRoot, "scripts", rel);
	const destPath = join(targetDir, "scripts", rel);
	mkdirSync(join(destPath, ".."), { recursive: true });
	writeFileSync(destPath, readFileSync(srcPath));
}
write(
	join(targetDir, "scripts", "validate.ts"),
	`import { validateBookInMemory } from "../packages/astro-bookkit/src/validators/book-validator";
import { listBookDirs, optionalArg } from "./_lib";

const mode = optionalArg("--mode") ?? "warn";
const requested = optionalArg("--book");
const books = requested ? [requested] : listBookDirs();

let totalErrors = 0;
for (const book of books) {
	const result = validateBookInMemory({
		workspaceRoot: process.cwd(),
		bookSlug: book,
	});
	for (const err of result.errors) {
		totalErrors += 1;
		console.error(\`  [\${err.machineCode}/\${err.severity}] \${err.location.file ?? "(book)"}: \${err.humanSummary}\`);
		console.error(\`    → \${err.nextAction}\`);
	}
	for (const err of result.warnings) {
		console.log(\`  [\${err.machineCode}/\${err.severity}] \${err.location.file ?? "(book)"}: \${err.humanSummary}\`);
	}
	console.log(\`VALIDATE \${book}: \${result.ok ? "ok" : "failed"} (\${result.errors.length} errors, \${result.warnings.length} warnings)\`);
}

if (books.length === 0) {
	console.error("No books found under apps/.");
	process.exit(1);
}
if (mode === "error" && totalErrors > 0) process.exit(1);
`,
);

if (markdownDir) {
	if (!existsSync(markdownDir))
		fail(`Markdown source directory not found: ${markdownDir}`);
	console.log(`Importing chapters from ${markdownDir}...`);
	const run = spawnSync(
		"bun",
		[
			"run",
			"scripts/import-book-from-markdown.ts",
			"--book",
			bookSlug,
			"--dir",
			markdownDir,
		],
		{ cwd: targetDir, stdio: "inherit" },
	);
	if (run.status !== 0) fail(`Import exited with status ${run.status}.`);
}

console.log(`
Done. Next:
  cd ${targetDir}
  bun install
  bun run validate
  bun run dev          (or: bun run build)
  bun run suggest      (analyzer proposes mechanism/tool drafts)
  bun run import --book ${bookSlug} --dir ./notes   (pull in existing markdown)
`);

function mkDir(path: string): void {
	mkdirSync(path, { recursive: true });
}

function writeStarterContent(root: string, opts: { title: string }): void {
	write(
		join(root, "chapters", "00-overview.mdx"),
		`---
slug: overview
status: draft
title: "Overview"
---

## Purpose

- The reader moves from a stuck, over-responsible stance to a practical, system-aware response.
- Causal stance: incentives and constraints drive outcomes more than individual intent.

## Recognition

## Exoneration

## Mechanism

- Preview the mechanisms this book will define and rely on.

## Agency

- Preview the small, reversible actions the reader will be able to take.

## Primary mechanisms referenced

- starter-mechanism
`,
	);
	write(
		join(root, "mechanisms", "starter-mechanism.mdx"),
		`---
slug: starter-mechanism
status: draft
title: "Starter mechanism"
definition: "A repeatable pattern where a system produces harm while preserving surface legitimacy."
is:
  - "A named incentive or process keeps harm in motion without clear accountability."
isNot:
  - "One-off mistakes or accidents with no repeatable structure."
predictions:
  - "If the mechanism is active, similar outcomes will appear across unrelated cases."
tests:
  - "Ask: if we swapped the person but kept the incentives, would the outcome stay the same?"
---

Replace this placeholder with the first real mechanism in your book.
`,
	);
	write(
		join(root, "toolkit", "starter-mechanism--starter-tool.mdx"),
		`---
slug: starter-mechanism--starter-tool
status: draft
mechanism: starter-mechanism
name: "Starter tool"
trigger: "When you notice the same harm repeating even after good-faith effort."
timeboxMinutes: 10
steps:
  - "Name the repeating outcome in one sentence."
failureLooksLike:
  - "You still cannot name a repeatable pattern after 10 minutes."
legitimateDemand:
  - "A clear, repeatable description of the harm that can be shared or escalated."
---

Keep this tool runnable by a depleted reader. No heroics.
`,
	);
	write(
		join(root, "examples", "starter-mechanism", "starter-example.mdx"),
		`---
mechanism: starter-mechanism
domain: "Workplace"
title: "Starter example"
status: draft
---

Write an example that illustrates the mechanism. Keep it swappable: replacing the example must not change the mechanism.
`,
	);
	write(
		join(root, "glossary", "starter-term.mdx"),
		`---
slug: starter-term
status: draft
term: "Starter term"
---

Define the key term here. Keep it concise and replaceable.
`,
	);
	const date = new Date().toISOString().slice(0, 10);
	write(
		join(root, "releases", `${date}-initial-draft.mdx`),
		`---
title: "Initial draft"
version: "0.1.0"
date: "${date}"
summary: "Introduces the first draft structure for ${opts.title}."
highlights:
  - "Added the initial overview chapter."
  - "Seeded one starter mechanism, example, and tool."
---

Update this release note before publication.
`,
	);
}

function writeConfig(
	path: string,
	opts: { bookSlug: string; title: string },
): void {
	write(
		path,
		`export const bookConfig = {
  slug: "${opts.bookSlug}",
  title: "${opts.title}",
  status: "draft",
  site: {
    url: "https://${opts.bookSlug}.book",
    enforceHttps: true,
    indexable: false,
    defaultMeta: {
      description: "Draft book instance for ${opts.title}.",
    },
  },
  localization: {
    defaultLocale: "en",
    includeDefaultPrefix: false,
    label: "Language",
    locales: [
      {
        code: "en",
        label: "English",
        isDefault: true,
        completeness: 1,
      },
    ],
  },
  previewAccess: {
    enabled: false,
    paramName: "preview",
    protectedPaths: ["/"],
    tokens: [],
  },
  features: {
    aiQa: false,
  },
  objectives: {
    readerStart:
      "Feels stuck at the starting edge of the transformation and lacks a reliable next move.",
    readerEnd:
      "Can name the core mechanism, route responsibility correctly, and take a small, reversible action.",
    transformation:
      "From stuck and over-responsible to system-aware action with a concrete first step.",
  },
  frame: {
    slug: "intervention",
    steps: ["recognition", "exoneration", "mechanism", "agency"],
    intent: "Move readers from recognition to agency with enforceable steps.",
  },
  causalStance:
    "Outcomes are shaped by incentives and constraints, not just individual intent or character.",
  constraints: {
    mechanismCountTarget: [6, 8],
    actionPrimitiveMaxMinutes: 10,
    examplesMustBeSwappable: true,
    orderingModel: "constraint-graph",
  },
  mechanisms: [],
  glossaryFocus: [],
} as const;

export default bookConfig;
`,
	);
}

function writeAppPackageJson(path: string, opts: { bookSlug: string }): void {
	write(
		path,
		`{
	"name": "@books/${opts.bookSlug}",
	"private": true,
	"version": "0.0.0",
	"type": "module",
	"scripts": {
		"dev": "astro dev",
		"build": "astro build"
	},
	"dependencies": {
		"@astrojs/mdx": "^6.0.1",
		"@bookkit/astro-bookkit": "workspace:*",
		"astro": "^7.2.2"
	}
}
`,
	);
}

// astro.config.mjs reads `site` from book.config.ts, so only the Worker name needs rewriting.
function rewriteWorkerName(path: string, opts: { bookSlug: string }): void {
	const content = readFileSync(path, "utf8");
	write(
		path,
		content.replace(
			/"name": "bookkit-[^"]+"/,
			`"name": "bookkit-${opts.bookSlug}"`,
		),
	);
}

function writeProjectRootFile(
	target: string,
	rel: string,
	opts: { bookSlug: string; title: string },
): void {
	if (rel === "tsconfig.base.json") {
		const src = join(repoRoot, rel);
		if (!existsSync(src)) return;
		copyTree(src, join(target, rel));
		return;
	}
	if (rel === ".gitignore") {
		write(
			join(target, rel),
			`node_modules/
dist/
.astro/
.vercel/
.netlify/
.DS_Store
`,
		);
		return;
	}
	if (rel === "package.json") {
		write(
			join(target, rel),
			`{
	"name": "${opts.bookSlug}-book",
	"private": true,
	"type": "module",
	"workspaces": ["apps/*", "packages/*"],
	"scripts": {
		"dev": "bun run --cwd apps/${opts.bookSlug} astro dev",
		"build": "bun run --cwd apps/${opts.bookSlug} astro build",
		"validate": "bun run scripts/validate.ts",
		"validate:error": "bun run scripts/validate.ts --mode error",
		"suggest": "bun run scripts/check-suggestions.ts",
		"runbooks": "bun run scripts/check-runbooks.ts",
		"import": "bun run scripts/import-book-from-markdown.ts",
		"deploy": "bun run --cwd apps/${opts.bookSlug} astro build && bun run --cwd apps/${opts.bookSlug} wrangler deploy"
	},
	"devDependencies": {
		"@astrojs/mdx": "^6.0.1",
		"astro": "^7.2.2",
		"bun-types": "^1.2.0",
		"js-yaml": "^4.1.1",
		"typescript": "^5.8.0",
		"wrangler": "^4.131.2"
	}
}
`,
		);
		return;
	}
	write(
		join(target, rel),
		`# ${opts.title}

A recompilable book built with Bookkit.

## Commands

\`\`\`bash
bun install
bun run validate        # compiler checks schemas, frames, ordering
bun run suggest         # analyzer proposes mechanism/tool drafts
bun run dev             # local Astro dev server
bun run build           # static build of the book
bun run runbooks        # compliance matrix for runbook-frame books
bun run deploy          # build, then publish dist/ to Cloudflare Workers static assets
bun run import --book ${opts.bookSlug} --dir ./notes   # pull existing markdown into chapters
\`\`\`

## Structure

- \`apps/${opts.bookSlug}/\` — one book instance (author decisions here).
- \`apps/${opts.bookSlug}/src/content/book/**\` — mechanisms, toolkit, chapters, examples, glossary, releases.
- \`packages/astro-bookkit/\` — the compiler engine (vendored; upgrade by re-running the scaffolder or replacing the folder).

## Rules that hold by construction

- Book-specific logic lives in the book app, never in the engine.
- Mechanisms are durable: changing a slug is a breaking change.
- Required frame steps are enforced, not implied.
- Actions fit in ≤10 minutes and survive a depleted reader.

AI features (Q&A against the book) are off by default. To enable, set
\`features.aiQa: true\` in the book config and run \`bun add @xenova/transformers\`
in \`packages/astro-bookkit\`.
`,
	);
}
