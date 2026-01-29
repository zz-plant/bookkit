import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const root = process.cwd();

if (hasBiomeConfig(root)) {
  const res = spawnSync("bunx", ["biome", "check", "."], { stdio: "inherit" });
  process.exit(res.status ?? 1);
}

if (hasPrettierConfig(root)) {
  const res = spawnSync("bunx", ["prettier", "--check", "."], { stdio: "inherit" });
  process.exit(res.status ?? 1);
}

console.log("No lint/format config found. Add Biome or Prettier to enable linting.");
process.exit(0);

function hasBiomeConfig(dir: string): boolean {
  return ["biome.json", "biome.jsonc"].some((file) => existsSync(join(dir, file)));
}

function hasPrettierConfig(dir: string): boolean {
  const configFiles = [
    ".prettierrc",
    ".prettierrc.json",
    ".prettierrc.js",
    "prettier.config.js",
  ];

  if (configFiles.some((file) => existsSync(join(dir, file)))) return true;
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { prettier?: unknown };
    return Boolean(pkg.prettier);
  } catch {
    return false;
  }
}
