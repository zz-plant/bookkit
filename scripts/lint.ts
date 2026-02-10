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

const message = "No lint/format config found. Add Biome or Prettier to enable linting.";

if (isCiEnvironment()) {
  console.error(`${message} Failing because CI requires an enforced lint policy.`);
  process.exit(1);
}

console.log(message);
process.exit(0);

function hasBiomeConfig(dir: string): boolean {
  if (["biome.json", "biome.jsonc"].some((file) => existsSync(join(dir, file)))) {
    return true;
  }

  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { biome?: unknown };
    return Boolean(pkg.biome);
  } catch {
    return false;
  }
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

function isCiEnvironment(): boolean {
  if (process.env.GITHUB_ACTIONS) return true;

  const ci = process.env.CI?.trim().toLowerCase();
  if (ci) {
    if (["1", "true", "yes", "on"].includes(ci)) return true;
    if (["0", "false", "no", "off"].includes(ci)) return false;
    return true;
  }

  return false;
}
