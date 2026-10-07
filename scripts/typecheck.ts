import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { listBookDirs, listPackageDirs, repoRoot } from "./_lib";

/**
 * check:types — typechecks every app and package, `.ts` and `.astro` alike.
 *
 *   bun run check:types                 # TypeScript 7, then astro check
 *   bun run check:types -- --tsc        # TypeScript 5 for the .ts pass (fallback)
 *   bun run check:types -- --no-astro   # .ts only, for a quick local loop
 *
 * TypeScript 7 is installed under the alias `typescript-native` because the
 * `typescript` package stays on 5.x: scripts/validate-book.ts parses
 * book.config.ts with the 5.x compiler API, which 7.x replaced.
 *
 * Neither compiler reads `.astro` files, so `astro check` covers them: every
 * book app, plus each package that ships `.astro` components. Template pages
 * are checked through their copies in each book (check:shims keeps them
 * identical).
 */

const root = repoRoot();
const useTsc5 = process.argv.includes("--tsc");
const skipAstro = process.argv.includes("--no-astro");
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

const hasAstroFiles = (dir: string) =>
  existsSync(dir) &&
  readdirSync(dir, { recursive: true }).some((entry) => String(entry).endsWith(".astro"));

const targets = [
  ...listBookDirs().map((book) => ({
    label: `apps/${book}`,
    dir: join(root, "apps", book),
  })),
  ...listPackageDirs().map((pkg) => ({
    label: `packages/${pkg}`,
    dir: join(root, "packages", pkg),
  })),
].filter((target) => existsSync(join(target.dir, "tsconfig.json")));

if (targets.length === 0) {
  console.error("No tsconfig.json files found under apps/* or packages/*.");
  process.exit(1);
}

let failed = 0;

for (const target of targets) {
  console.log(`\nTypechecking ${target.label} (${compiler.label})`);
  const res = spawnSync(
    compiler.command,
    [...compiler.args, "--noEmit", "-p", join(target.dir, "tsconfig.json")],
    { stdio: "inherit" },
  );
  if (res.error) console.error(`Could not run ${compiler.label}: ${res.error.message}`);
  if (res.status !== 0) failed++;
}

type AstroCheckResult = { label: string; status: number; output: string };

const runAstroCheck = (target: { label: string; dir: string }) =>
  new Promise<AstroCheckResult>((resolve) => {
    let output = "";
    const child = spawn("bunx", ["astro", "check"], { cwd: target.dir });
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", (error) =>
      resolve({
        label: target.label,
        status: 1,
        output: `${output}\nCould not run astro check: ${error.message}`,
      }),
    );
    child.on("close", (status) =>
      resolve({ label: target.label, status: status ?? 1, output }),
    );
  });

if (!skipAstro) {
  const astroTargets = targets.filter(
    (target) =>
      existsSync(join(target.dir, "astro.config.mjs")) ||
      hasAstroFiles(join(target.dir, "src")),
  );
  console.log(
    `\nChecking .astro files in ${astroTargets.length} project(s) (astro check)`,
  );

  // Each project is checked in its own process; run as many as there are cores.
  const queue = [...astroTargets];
  const results = new Map<string, AstroCheckResult>();
  await Promise.all(
    Array.from(
      { length: Math.min(queue.length, availableParallelism()) },
      async () => {
        for (let target = queue.shift(); target; target = queue.shift()) {
          results.set(target.label, await runAstroCheck(target));
        }
      },
    ),
  );

  for (const target of astroTargets) {
    const result = results.get(target.label);
    if (!result) continue;
    if (result.status === 0) {
      console.log(`  ✓ ${result.label}`);
    } else {
      failed++;
      console.log(`  ✗ ${result.label}\n${result.output}`);
    }
  }
}

process.exit(failed === 0 ? 0 : 1);
