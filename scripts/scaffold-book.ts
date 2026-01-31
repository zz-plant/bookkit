import { cpSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureDir, optionalArg, readText, requireArg, slugify } from "./_lib";

const rawBook = requireArg("--book");
const template = optionalArg("--template") ?? "bad-people";
const titleArg = optionalArg("--title");
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

const contentRoot = join(targetDir, "src", "content", "book");
rmSync(contentRoot, { recursive: true, force: true });
ensureDir(contentRoot);
const contentDirs = ["chapters", "examples", "glossary", "mechanisms", "releases", "toolkit"];
contentDirs.forEach((dir) => ensureDir(join(contentRoot, dir)));
writeFileSync(
  join(contentRoot, "README.md"),
  `# Book content records\n\nStore structured content for the ${title} book instance in subfolders under this directory.\n\n- \`chapters/\` for chapter drafts and sequences.\n- \`examples/\` for replaceable examples and cases.\n- \`glossary/\` for glossary entries.\n- \`mechanisms/\` for mechanism definitions.\n- \`releases/\` for versioned release notes and changelog entries.\n- \`toolkit/\` for action primitives and tools.\n\nKeep book-specific content here. Engine logic belongs in \`packages/astro-bookkit/\`.\n`,
  "utf8"
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
    readerStart: "TODO: Describe the reader's starting state.",
    readerEnd: "TODO: Describe the reader's end state.",
    transformation: "TODO: Summarize the reader transformation.",
  },
  frame: {
    slug: "intervention",
    steps: ["recognition", "exoneration", "mechanism", "agency"],
    intent: "TODO: Describe how the frame moves the reader.",
  },
  causalStance: "TODO: Describe how responsibility and causality are routed.",
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

console.log(`✅ Scaffolded new book at apps/${slug}`);
