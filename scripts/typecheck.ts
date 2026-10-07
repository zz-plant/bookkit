import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { listBookDirs, listPackageDirs, repoRoot } from "./_lib";

/**
 * check:types — typechecks every tsconfig under apps/* and packages/*.
 *
 *   bun run check:types            # TypeScript 7, the native compiler
 *   bun run check:types -- --tsc   # TypeScript 5, the JS compiler (fallback)
 *
 * TypeScript 7 is installed under the alias `typescript-native` because the
 * `typescript` package stays on 5.x: scripts/validate-book.ts parses
 * book.config.ts with the 5.x compiler API, which 7.x replaced.
 *
 * Neither compiler reads `.astro` files.
 */

const root = repoRoot();
const useTsc5 = process.argv.includes("--tsc");
const nativeTsc = join(root, "node_modules", "typescript-native", "bin", "tsc");

if (!useTsc5 && !existsSync(nativeTsc)) {
  console.error(
    "TypeScript 7 is not installed (devDependency typescript-native). Run bun install, or pass --tsc to typecheck with TypeScript 5.",
  );
  process.exit(1);
}

// The TypeScript 7 launcher is a JS shim; run it with the current runtime so
// it needs neither a `node` on PATH nor a linked bin.
const compiler = useTsc5
  ? { label: "TypeScript 5", command: "bunx", args: ["tsc"] }
  : { label: "TypeScript 7", command: process.execPath, args: [nativeTsc] };

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
  console.log(`\nTypechecking ${target.label} (${compiler.label})`);
  const res = spawnSync(
    compiler.command,
    [...compiler.args, "--noEmit", "-p", target.config],
    { stdio: "inherit" },
  );
  if (res.error) console.error(`Could not run ${compiler.label}: ${res.error.message}`);
  if (res.status !== 0) failed++;
}

process.exit(failed === 0 ? 0 : 1);
