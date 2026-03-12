import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { listBookDirs } from "./_lib";

const books = listBookDirs();
const errors: string[] = [];
const requiredTags = ["[owner:", "[milestone:", "[debt:"];

for (const book of books) {
  const todoPath = join(process.cwd(), "apps", book, "TODOS.md");
  if (!existsSync(todoPath)) {
    errors.push(`Missing TODO tracker: ${todoPath}`);
    continue;
  }

  const lines = readFileSync(todoPath, "utf8").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;

    if (/^\s*-\s*\[x\]/i.test(line)) {
      errors.push(`${todoPath}:${lineNumber} contains completed checklist entry; move completed work to release notes/changelog artifacts.`);
      continue;
    }

    if (/^\s*-\s*\[ \]/.test(line)) {
      for (const tag of requiredTags) {
        if (!line.includes(tag)) {
          errors.push(`${todoPath}:${lineNumber} is missing metadata tag ${tag}`);
        }
      }
    }
  }
}

if (errors.length > 0) {
  console.error("TODO policy check failed:\n");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("TODO policy check passed.");
