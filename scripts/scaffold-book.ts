import { cpSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	ensureDir,
	optionalArg,
	readText,
	requireArg,
	slugify,
	writeFileSafe,
} from "./_lib";
import { syncShimTemplatesToBook } from "./_shim-templates";

const rawBook = requireArg("--book");
const template = optionalArg("--template") ?? "bad-people";
const titleArg = optionalArg("--title");
const skipRootScripts = process.argv.includes("--skip-root-scripts");
const skipStarterContent = process.argv.includes("--skip-starter-content");
const slug = slugify(rawBook);

if (slug !== rawBook) {
	console.warn(`⚠️ Normalizing book slug from "${rawBook}" to "${slug}".`);
}

const title =
	titleArg ??
	slug
		.split("-")
		.map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
		.join(" ");

const root = process.cwd();
const templateDir = join(root, "apps", template);
const targetDir = join(root, "apps", slug);

if (!existsSync(templateDir)) {
	console.error(`Template book not found at ${templateDir}`);
	process.exit(1);
}

if (existsSync(targetDir)) {
	console.error(`Target directory already exists: ${targetDir}`);
	process.exit(1);
}

cpSync(templateDir, targetDir, { recursive: true });

syncShimTemplatesToBook(slug);

const contentRoot = join(targetDir, "src", "content", "book");
rmSync(contentRoot, { recursive: true, force: true });
ensureDir(contentRoot);
const contentDirs = [
	"chapters",
	"examples",
	"glossary",
	"mechanisms",
	"releases",
	"toolkit",
];
for (const dir of contentDirs) {
	ensureDir(join(contentRoot, dir));
}
writeFileSync(
	join(contentRoot, "README.md"),
	`# Book content records\n\nStore structured content for the ${title} book instance in subfolders under this directory.\n\n- \`chapters/\` for chapter drafts and sequences.\n- \`examples/\` for replaceable examples and cases.\n- \`glossary/\` for glossary entries.\n- \`mechanisms/\` for mechanism definitions.\n- \`releases/\` for versioned release notes and changelog entries.\n- \`toolkit/\` for action primitives and tools.\n\nKeep book-specific content here. Engine logic belongs in \`packages/astro-bookkit/\`.\n`,
	"utf8",
);

const pkgPath = join(targetDir, "package.json");
const pkg = JSON.parse(readText(pkgPath));
pkg.name = `@books/${slug}`;
pkg.scripts = pkg.scripts ?? {};
pkg.scripts.validate = `bun run ../../scripts/validate-book.ts --book ${slug}`;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

const bookConfigPath = join(targetDir, "src", "book.config.ts");
const bookConfig = `export const bookConfig = {
  slug: "${slug}",
  title: "${title}",
  status: "draft",
  site: {
    url: "https://${slug}.book",
    enforceHttps: true,
    indexable: false,
    defaultMeta: {
      description: "Draft book instance for ${title}.",
      ogImage: "/og/default.svg",
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
    aiQa: true,
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
`;

writeFileSync(bookConfigPath, bookConfig, "utf8");

if (!skipStarterContent) {
	scaffoldStarterContent({ contentRoot, title });
}

const addRootScripts = process.argv.includes("--add-root-scripts");

if (addRootScripts) {
	const rootPackagePath = join(root, "package.json");
	const rootPackage = JSON.parse(readText(rootPackagePath));
	rootPackage.scripts = rootPackage.scripts ?? {};
	const rootScripts = rootPackage.scripts as Record<string, string>;
	const devKey = `dev:${slug}`;
	const buildKey = `build:${slug}`;

	if (!rootScripts[devKey]) {
		rootScripts[devKey] = `bun run --filter @books/${slug} dev`;
	}
	if (!rootScripts[buildKey]) {
		rootScripts[buildKey] = `bun run --filter @books/${slug} build`;
	}

	writeFileSync(
		rootPackagePath,
		`${JSON.stringify(rootPackage, null, 2)}\n`,
		"utf8",
	);
}

console.log(`✅ Scaffolded new book at apps/${slug}`);
console.log(`👉 Run book: bun run bookkit dev ${slug}`);

type StarterContentOptions = {
	contentRoot: string;
	title: string;
};

function scaffoldStarterContent({ contentRoot, title }: StarterContentOptions) {
	const chapterPath = join(contentRoot, "chapters", "00-overview.mdx");
	const mechanismSlug = "starter-mechanism";
	const mechanismPath = join(contentRoot, "mechanisms", `${mechanismSlug}.mdx`);
	const exampleDir = join(contentRoot, "examples", mechanismSlug);
	const examplePath = join(exampleDir, "starter-example.mdx");
	const toolSlug = `${mechanismSlug}--starter-tool`;
	const toolPath = join(contentRoot, "toolkit", `${toolSlug}.mdx`);
	const glossaryPath = join(contentRoot, "glossary", "starter-term.mdx");

	ensureDir(exampleDir);

	const chapter = `---
slug: overview
status: draft
title: "Overview"
---

## Purpose

- Reader moves from a stuck, over-responsible stance to a practical, system-aware response.
- Causal stance: incentives and constraints drive outcomes more than individual virtue.

## Outline

### Recognition
- Name the recurring pattern or harm that the reader keeps encountering.

### Exoneration
- State what gets disentangled from blame so responsibility can be routed correctly.

### Mechanism
- Preview the mechanism(s) this book will define and rely on.

### Agency
- Preview the small, reversible actions the reader will be able to take.

## Primary mechanisms referenced

- ${mechanismSlug}
`;

	const mechanism = `---
slug: ${mechanismSlug}
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

Replace this placeholder mechanism with the first real mechanism in your book.
`;

	const example = `---
mechanism: ${mechanismSlug}
domain: "Workplace"
title: "Starter example"
status: draft
---

Write an example that illustrates the mechanism above.

Constraints:
- Do not define the mechanism here.
- Make the example swappable without changing the mechanism.
`;

	const tool = `---
slug: ${toolSlug}
status: draft
mechanism: ${mechanismSlug}
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
`;

	const glossary = `---
slug: starter-term
status: draft
term: "Starter term"
---

Define the key term here. Keep it concise and replaceable.
`;

	const date = new Date().toISOString().slice(0, 10);
	const releasePath = join(
		contentRoot,
		"releases",
		`${date}-initial-draft.mdx`,
	);
	const release = `---
title: "Initial draft"
version: "0.1.0"
date: "${date}"
summary: "Introduces the first draft structure for ${title}."
highlights:
  - "Added the initial overview chapter."
  - "Seeded one starter mechanism, example, and tool."
---

This placeholder release note should be updated before publication.
`;

	writeFileSafe(chapterPath, chapter);
	writeFileSafe(mechanismPath, mechanism);
	writeFileSafe(examplePath, example);
	writeFileSafe(toolPath, tool);
	writeFileSafe(glossaryPath, glossary);
	writeFileSafe(releasePath, release);
}
