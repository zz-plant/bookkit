import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { listBookDirs } from "./_lib";

const books = listBookDirs();
if (books.length === 0) {
  console.log("No books found under apps/*");
  process.exit(0);
}

for (const book of books) {
  const pkgPath = join(process.cwd(), "apps", book, "package.json");
  let name = `@books/${book}`;
  if (existsSync(pkgPath)) {
    try {
      const parsed = JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: string };
      if (parsed.name) name = parsed.name;
    } catch {
      // ignore malformed package.json
    }
  }
  console.log(`${book}\t${name}`);
}
