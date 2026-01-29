import { readdir } from "node:fs/promises";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  args: Bun.argv,
  options: {
    book: { type: "string" },
  },
  strict: false,
  allowPositionals: true,
});

const conceptish = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,4})\b/g;

function walk(dir: string, out: string[] = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.isFile() && (p.endsWith(".md") || p.endsWith(".mdx"))) out.push(p);
  }
  return out;
}

async function discoverBooks(): Promise<string[]> {
  if (values.book) {
    console.log(`\ud83c\udfaf Targeting specific book: ${values.book}`);
    return [values.book];
  }

  console.log("\ud83d\udce1 No flag provided. Auto-discovering books...");
  const appsDir = join(process.cwd(), "apps");

  try {
    const entries = await readdir(appsDir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error) {
    console.error("\u274c Fatal: Could not find the 'apps' directory.");
    process.exit(1);
  }
}

async function checkConceptsForBook(book: string): Promise<number> {
  const base = join(process.cwd(), "apps", book, "src", "content", "book");
  if (!existsSync(base)) {
    throw new Error(`Missing content directory for ${book} at ${base}`);
  }

  const files = walk(base);
  const hits: Record<string, Set<string>> = {};

  for (const file of files) {
    const txt = readFileSync(file, "utf8");
    let match: RegExpExecArray | null;
    while ((match = conceptish.exec(txt))) {
      const term = match[1];
      if (term.length < 8) continue;
      if (/^(This|That|When|Because|Reader|Bookkit|Astro|Bun)$/.test(term)) continue;
      (hits[file] ??= new Set()).add(term);
    }
  }

  let bookCount = 0;
  for (const [file, terms] of Object.entries(hits)) {
    if (terms.size === 0) continue;
    bookCount += terms.size;
    console.log(`\n[${book}] ${file}`);
    for (const term of [...terms].sort()) console.log(`  - ${term}`);
  }

  return bookCount;
}

async function main() {
  const books = await discoverBooks();

  if (books.length === 0) {
    console.error("No books found under apps/. Pass --book <slug> to target a specific book.");
    process.exit(1);
  }

  let globalFailure = false;
  let totalCount = 0;

  for (const book of books) {
    console.log(`\n\ud83d\udd0d Scanning: ${book}`);
    try {
      totalCount += await checkConceptsForBook(book);
    } catch (error) {
      console.error(`\u274c Issues found in ${book}: ${(error as Error).message}`);
      globalFailure = true;
    }
  }

  if (globalFailure) {
    console.log("\n\ud83d\udca5 Validation failed.");
    process.exit(1);
  }

  if (totalCount === 0) {
    console.log("No likely floating concepts found.");
    process.exit(0);
  }

  console.log(
    `\nFound ${totalCount} likely concept terms. If any are intended as mechanisms/glossary terms, register them.`
  );
  process.exit(0);
}

main();
