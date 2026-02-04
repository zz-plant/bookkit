import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { listBookDirs, listPackageDirs, repoRoot } from "./_lib";

const root = repoRoot();
const targets = [
  ...listBookDirs().map((book) => ({
    label: `apps/${book}`,
    config: join(root, "apps", book, "tsconfig.json"),
  })),
  ...listPackageDirs().map((pkg) => ({
    label: `packages/${pkg}`,
    config: join(root, "packages", pkg, "tsconfig.json"),
  })),
].filter((target) => existsSync(target.config));

if (targets.length === 0) {
  console.error("No tsconfig.json files found under apps/* or packages/*.");
  process.exit(1);
}

let failed = 0;

for (const target of targets) {
  console.log(`\nTypechecking ${target.label}`);
  const res = spawnSync("bunx", ["tsc", "--noEmit", "-p", target.config], {
    stdio: "inherit",
  });
  if (res.status !== 0) failed++;
}

process.exit(failed === 0 ? 0 : 1);
