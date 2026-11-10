---
name: verify
description: Use before committing or pushing any change. Runs the checks the change needs (chosen from the files it touches), reports only findings in those files, and says what failed.
---

# verify

## When to use

Before every commit or push, in any lane. Lane skills (`content-edit`, `engine-change`, `release`, `reader-typography`) say what to change; this says how to confirm it.

## While iterating

`bun run verify -- --quick` runs the same checks with the tests narrowed to the change: the engine's own tests for engine code (about 3 s), and for a script the test file beside it. The tests that build books, most of the suite's minute, wait for the full run. For one module, `bun test packages/astro-bookkit/src/<module>` answers in under a second. A quick pass is not the gate: step 1 below still comes before a commit.

## Steps

1. Run `bun run verify`. It compares against `origin/main` (committed, staged, unstaged, and untracked files) and runs the checks those paths need. `scripts/lib/verify-plan.ts` holds the mapping, which is also the table in `CONTRIBUTING.md`.
2. Read the summary: one line per check. A failed check prints the tail of its output; content checks list only findings in files you changed.
3. Fix the root cause and run it again. Do not weaken a validator, skip a check, or edit a synced shim in an app (`astro.config.mjs`, `tsconfig.json`, `public/_headers`: edit `packages/astro-bookkit/templates/book-app/**`, then `bun run sync:shims`).
4. Before a release or deploy, run `bun run verify -- --all` (everything CI runs). It prints a count of each check's warnings; `--warnings` lists them.

For tooling: `--json` prints one summary object (`ok`, `changed`, and per-check `ok`, `findings`, `output`); `--list` shows the plan without running it; `--base <ref>` changes the comparison; `--skip <gate>` leaves one gate out.

## Output

- [ ] `bun run verify` passed, or every remaining failure is explained in the PR
