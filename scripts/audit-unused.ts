import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import { listBookDirs, optionalArg } from "./_lib";

type FrontmatterValue = string | string[] | number | boolean | null;

const onlyBook = optionalArg("--book");
const books = onlyBook ? [onlyBook] : listBookDirs();

if (books.length === 0) {
  console.error("No books found under apps/*");
  process.exit(1);
}

let issueCount = 0;

for (const book of books) {
  const bookRoot = join(process.cwd(), "apps", book, "src", "content", "book");
  const mechanismFiles = listContentFiles(join(bookRoot, "mechanisms"));
  const toolFiles = listContentFiles(join(bookRoot, "toolkit"));
  const exampleFiles = listContentFiles(join(bookRoot, "examples"));

  const mechanisms = new Set<string>();
  for (const file of mechanismFiles) {
    const { data, hasFrontmatter } = parseFrontmatter(readFileSync(file, "utf8"));
    const slug = toStringValue(data.slug) || basename(file).replace(/\.(md|mdx)$/i, "");
    if (hasFrontmatter && slug) mechanisms.add(slug);
  }

  const toolsByMechanism = new Map<string, string[]>();
  const toolsMissingMechanism: string[] = [];

  for (const file of toolFiles) {
    const { data } = parseFrontmatter(readFileSync(file, "utf8"));
    const mechanism = toStringValue(data.mechanism);
    if (!mechanism) {
      toolsMissingMechanism.push(file);
      continue;
    }
    const list = toolsByMechanism.get(mechanism) ?? [];
    list.push(file);
    toolsByMechanism.set(mechanism, list);
  }

  const examplesByMechanism = new Map<string, string[]>();
  const examplesMissingMechanism: string[] = [];

  for (const file of exampleFiles) {
    const { data } = parseFrontmatter(readFileSync(file, "utf8"));
    const mechanism = toStringValue(data.mechanism);
    if (!mechanism) {
      examplesMissingMechanism.push(file);
      continue;
    }
    const list = examplesByMechanism.get(mechanism) ?? [];
    list.push(file);
    examplesByMechanism.set(mechanism, list);
  }

  const mechanismsWithoutTools = [...mechanisms].filter((slug) => !toolsByMechanism.has(slug));
  const mechanismsWithoutExamples = [...mechanisms].filter(
    (slug) => !examplesByMechanism.has(slug)
  );
  const toolsWithMissingMechanism = [...toolsByMechanism.keys()].filter(
    (slug) => !mechanisms.has(slug)
  );
  const examplesWithMissingMechanism = [...examplesByMechanism.keys()].filter(
    (slug) => !mechanisms.has(slug)
  );

  if (
    mechanismsWithoutTools.length === 0 &&
    mechanismsWithoutExamples.length === 0 &&
    toolsMissingMechanism.length === 0 &&
    examplesMissingMechanism.length === 0 &&
    toolsWithMissingMechanism.length === 0 &&
    examplesWithMissingMechanism.length === 0
  ) {
    console.log(`\n${book}: no issues found.`);
    continue;
  }

  console.log(`\n${book}:`);
  reportList("Mechanisms without tools", mechanismsWithoutTools);
  reportList("Mechanisms without examples", mechanismsWithoutExamples);
  reportList("Tools missing mechanism frontmatter", toolsMissingMechanism);
  reportList("Examples missing mechanism frontmatter", examplesMissingMechanism);
  reportList("Tools referencing unknown mechanisms", toolsWithMissingMechanism);
  reportList("Examples referencing unknown mechanisms", examplesWithMissingMechanism);

  issueCount +=
    mechanismsWithoutTools.length +
    mechanismsWithoutExamples.length +
    toolsMissingMechanism.length +
    examplesMissingMechanism.length +
    toolsWithMissingMechanism.length +
    examplesWithMissingMechanism.length;
}

process.exit(issueCount === 0 ? 0 : 1);

function listContentFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listContentFiles(fullPath));
    } else if (entry.isFile() && isContentFile(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

function isContentFile(path: string): boolean {
  return path.endsWith(".md") || path.endsWith(".mdx");
}

function parseFrontmatter(content: string): { data: Record<string, FrontmatterValue>; hasFrontmatter: boolean } {
  if (!content.startsWith("---")) {
    return { data: {}, hasFrontmatter: false };
  }
  const end = content.indexOf("\n---", 3);
  if (end === -1) return { data: {}, hasFrontmatter: false };
  const raw = content.slice(3, end).trim();
  const lines = raw.split(/\r?\n/);
  const data: Record<string, FrontmatterValue> = {};
  let currentKey: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const keyMatch = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(trimmed);
    if (keyMatch) {
      const key = keyMatch[1];
      const valueRaw = keyMatch[2];
      currentKey = key;
      if (!valueRaw) {
        data[key] = [];
      } else {
        data[key] = coerceValue(valueRaw);
        currentKey = null;
      }
      continue;
    }
    const listMatch = /^-\s*(.*)$/.exec(trimmed);
    if (listMatch && currentKey) {
      const current = data[currentKey];
      if (Array.isArray(current)) current.push(coerceValue(listMatch[1]) as string);
    }
  }

  return { data, hasFrontmatter: true };
}

function coerceValue(value: string): FrontmatterValue {
  const cleaned = value.replace(/^"|"$/g, "").replace(/^'|'$/g, "");
  if (cleaned === "true") return true;
  if (cleaned === "false") return false;
  if (cleaned !== "" && !Number.isNaN(Number(cleaned))) return Number(cleaned);
  return cleaned;
}

function toStringValue(value: FrontmatterValue): string {
  if (typeof value === "string") return value.trim();
  return "";
}

function reportList(title: string, items: string[]) {
  if (items.length === 0) return;
  console.log(`- ${title}:`);
  for (const item of items) console.log(`  - ${item}`);
}
