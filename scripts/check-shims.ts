import { existsSync, readFileSync } from "node:fs";

import {
  getBookShimPath,
  listShimBooks,
  readShimTemplate,
  shimPaths,
  syncShimTemplatesToBook,
} from "./_shim-templates";

const writeMode = process.argv.includes("--write");
const books = listShimBooks();
const issues: string[] = [];

if (writeMode) {
  for (const book of books) {
    syncShimTemplatesToBook(book);
  }
  console.log(`Shim templates synced from ${shimPaths.length} canonical wrapper(s) into ${books.length} book(s).`);
  process.exit(0);
}

for (const relativePath of shimPaths) {
  let canonicalContent: string;

  try {
    canonicalContent = readShimTemplate(relativePath);
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
    continue;
  }

  for (const book of books) {
    const targetPath = getBookShimPath(book, relativePath);

    if (!existsSync(targetPath)) {
      issues.push(`Missing shim file: ${targetPath}`);
      continue;
    }

    const actualContent = readFileSync(targetPath, "utf8");
    if (actualContent !== canonicalContent) {
      issues.push(`Out-of-sync shim file: ${targetPath} (run: bun run sync:shims)`);
    }
  }
}

if (issues.length > 0) {
  console.error("Shim consistency check failed:\n");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log("Shim consistency check passed.");
