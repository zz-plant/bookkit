import { copyFileSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";
import { ensureDir, optionalArg, repoRoot, requireArg } from "./_lib";

type SectionEntry = {
  relPath: string;
  title: string;
};

const book = requireArg("--book");
const outputArg = optionalArg("--out");
const root = repoRoot();
const contentDir = join(root, "apps", book, "src", "content", "book");

if (!existsSync(contentDir)) {
  console.error(`Book content directory not found: ${contentDir}`);
  process.exit(1);
}

const outDir = outputArg ?? join(root, "apps", book, "exports", "gitbook");

rmSync(outDir, { recursive: true, force: true });
ensureDir(outDir);

const markdownFiles = collectMarkdownFiles(contentDir);
const assetFiles = collectNonMarkdownFiles(contentDir);
const hasRootReadme = markdownFiles.some(
  (file) => relative(contentDir, file).replace(/\\/g, "/") === "README.md",
);

for (const filePath of markdownFiles) {
  const relPath = relative(contentDir, filePath);
  const destPath = join(outDir, relPath);
  ensureDir(dirname(destPath));
  writeFileSync(destPath, readFileSync(filePath, "utf8"), "utf8");
}

for (const filePath of assetFiles) {
  const relPath = relative(contentDir, filePath);
  const destPath = join(outDir, relPath);
  ensureDir(dirname(destPath));
  copyFileSync(filePath, destPath);
}

if (!hasRootReadme) {
  const fallbackReadme = `# ${toTitleCase(book)}\n\nThis export was generated from Bookkit content records.\n`;
  writeFileSync(join(outDir, "README.md"), fallbackReadme, "utf8");
}

const summary = buildSummary(markdownFiles, contentDir);
writeFileSync(join(outDir, "SUMMARY.md"), summary, "utf8");

console.log(`GitBook export written to ${outDir}`);

function collectMarkdownFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectMarkdownFiles(fullPath));
      continue;
    }
    if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") {
      results.push(fullPath);
    }
  }
  return results.sort();
}

function collectNonMarkdownFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectNonMarkdownFiles(fullPath));
      continue;
    }
    if (entry.isFile() && extname(entry.name).toLowerCase() !== ".md") {
      results.push(fullPath);
    }
  }
  return results.sort();
}

function buildSummary(files: string[], baseDir: string): string {
  const sections = new Map<string, SectionEntry[]>();

  for (const filePath of files) {
    const relPath = relative(baseDir, filePath).replace(/\\/g, "/");
    if (relPath === "README.md") continue;

    const [section] = relPath.split("/");
    const title = titleFromFile(filePath);
    const entry: SectionEntry = { relPath, title };
    const bucket = sections.get(section) ?? [];
    bucket.push(entry);
    sections.set(section, bucket);
  }

  const lines = ["# Summary", "", "* [Introduction](README.md)"];
  const orderedSections = Array.from(sections.keys()).sort();

  for (const section of orderedSections) {
    const entries = sections.get(section) ?? [];
    entries.sort((a, b) => a.relPath.localeCompare(b.relPath));
    const header = section === "." ? "Other" : toTitleCase(section);
    lines.push(`* ${header}`);
    for (const entry of entries) {
      lines.push(`  * [${entry.title}](${entry.relPath})`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

function titleFromFile(filePath: string): string {
  const contents = readFileSync(filePath, "utf8");
  const match = contents.match(/^#\s+(.+)$/m);
  if (match) return match[1].trim();
  return toTitleCase(basename(filePath, extname(filePath)));
}

function toTitleCase(value: string): string {
  return value
    .replace(/[-_]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
