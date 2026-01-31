import { existsSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";
import { listBookDirs } from "./_lib";

const allowedExtensions = new Set([".md", ".mdx", ".json", ".yml", ".yaml", ".txt", ".csv"]);
const allowedFilenames = new Set([".gitkeep"]);

const errors: string[] = [];

for (const book of listBookDirs()) {
  const contentRoot = join(process.cwd(), "apps", book, "src", "content", "book");
  if (!existsSync(contentRoot)) continue;
  for (const file of listFiles(contentRoot)) {
    const baseName = file.split("/").pop() ?? file;
    if (allowedFilenames.has(baseName)) continue;
    const extension = extname(file);
    if (!allowedExtensions.has(extension)) {
      errors.push(
        `Disallowed file in content bindings: ${file}\n` +
          "Move logic/assets to packages/astro-bookkit or apps/<book>/src and keep content as data-only.",
      );
    }
  }
}

if (errors.length > 0) {
  console.error("\nSEPARATION VIOLATIONS");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

function listFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}
