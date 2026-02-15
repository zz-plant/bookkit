import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readText, requireArg, slugify } from "./_lib";

const rawBook = requireArg("--book");
const slug = slugify(rawBook);
const skipRootScripts = process.argv.includes("--skip-root-scripts");
const dryRun = process.argv.includes("--dry-run");

if (slug !== rawBook) {
  console.warn(`⚠️ Normalizing book slug from "${rawBook}" to "${slug}".`);
}

const root = process.cwd();
const targetDir = join(root, "apps", slug);

if (!existsSync(targetDir)) {
  console.error(`Book app does not exist: apps/${slug}`);
  process.exit(1);
}

if (dryRun) {
  console.log(`📝 Would remove: apps/${slug}`);
} else {
  rmSync(targetDir, { recursive: true, force: true });
  console.log(`✅ Removed book app: apps/${slug}`);
}

if (!skipRootScripts) {
  const packageJsonPath = join(root, "package.json");
  const packageJson = JSON.parse(readText(packageJsonPath));
  packageJson.scripts = packageJson.scripts ?? {};

  const scripts = packageJson.scripts as Record<string, string>;
  const devKey = `dev:${slug}`;
  const buildKey = `build:${slug}`;
  let removed = 0;

  if (devKey in scripts) {
    if (dryRun) {
      console.log(`📝 Would remove script: ${devKey}`);
    } else {
      delete scripts[devKey];
      removed += 1;
    }
  }

  if (buildKey in scripts) {
    if (dryRun) {
      console.log(`📝 Would remove script: ${buildKey}`);
    } else {
      delete scripts[buildKey];
      removed += 1;
    }
  }

  if (!dryRun) {
    writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
    console.log(`✅ Removed ${removed} root script(s).`);
  }
}
