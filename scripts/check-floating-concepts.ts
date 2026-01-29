import { join } from "node:path";
import { readdirSync, readFileSync } from "node:fs";
import { listBookDirs, optionalArg } from "./_lib";

const selectedBook = optionalArg("--book");
const books = selectedBook ? [selectedBook] : listBookDirs();
if (books.length === 0) {
  console.error("No books found under apps/. Pass --book <slug> to target a specific book.");
  process.exit(1);
}

function walk(dir: string, out: string[] = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.isFile() && (p.endsWith(".md") || p.endsWith(".mdx"))) out.push(p);
  }
  return out;
}

const conceptish = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,4})\b/g;

let count = 0;
for (const book of books) {
  const base = join(process.cwd(), "apps", book, "src", "content", "book");
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
    if (books.length > 1) {
      console.log(`\n[${book}] ${file}`);
    } else {
      console.log(`\n${file}`);
    }
    for (const term of [...terms].sort()) console.log(`  - ${term}`);
  }

  count += bookCount;
}

if (count === 0) {
  console.log("No likely floating concepts found.");
  process.exit(0);
}

console.log(`\nFound ${count} likely concept terms. If any are intended as mechanisms/glossary terms, register them.`);
process.exit(0);
