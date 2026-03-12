import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";
import { listBookDirs } from "./_lib";

const writeMode = process.argv.includes("--write");
const books = listBookDirs();
const canonicalBook = "bad-people";

const shimPaths = [
  "src/lib/book-entrypoints.ts",
  "src/lib/exports.ts",
  "src/lib/og.ts",
  "src/lib/release-notes.ts",
  "src/lib/versions.ts",
  "src/pages/api/analytics.json.ts",
  "src/pages/api/export-analytics.json.ts",
  "src/pages/api/feedback.json.ts",
  "src/pages/api/preview-analytics.json.ts",
  "src/pages/api/release-analytics.json.ts",
  "src/pages/api/release-email.json.ts",
  "src/pages/api/release-webhook.json.ts",
];

if (!books.includes(canonicalBook)) {
  console.error(`Canonical book "${canonicalBook}" not found under apps/*.`);
  process.exit(1);
}

const issues: string[] = [];

for (const relativePath of shimPaths) {
  const canonicalPath = join(process.cwd(), "apps", canonicalBook, relativePath);
  if (!existsSync(canonicalPath)) {
    issues.push(`Missing canonical shim: ${canonicalPath}`);
    continue;
  }

  const canonicalContent = readFileSync(canonicalPath, "utf8");

  for (const book of books) {
    if (book === canonicalBook) continue;
    const targetPath = join(process.cwd(), "apps", book, relativePath);

    if (writeMode) {
      mkdirSync(dirname(targetPath), { recursive: true });
      copyFileSync(canonicalPath, targetPath);
      continue;
    }

    if (!existsSync(targetPath)) {
      issues.push(`Missing shim file: ${targetPath}`);
      continue;
    }

    const actual = readFileSync(targetPath, "utf8");
    if (actual !== canonicalContent) {
      issues.push(`Out-of-sync shim file: ${targetPath} (run: bun run sync:shims)`);
    }
  }
}

if (writeMode) {
  console.log(`Shim templates synced from ${canonicalBook} to ${books.length - 1} book(s).`);
  process.exit(0);
}

if (issues.length > 0) {
  console.error("Shim consistency check failed:\n");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log("Shim consistency check passed.");
