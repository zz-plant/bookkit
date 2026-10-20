# Contributing to Bookkit

You do not need full-system context to contribute safely. Pick a lane, run checks, and keep architecture boundaries intact.

For commands see [`README.md`](./README.md). For how the system is structured — layers, engine module map, import tiers — see [`docs/architecture.md`](./docs/architecture.md). For hard invariants see [`AGENTS.md`](./AGENTS.md).

---

## Fast-start workflow

1. Install dependencies: `bun install` (this also installs the pre-commit hook).
2. Make a focused change.
3. Run `bun run verify`. It reads what changed since `origin/main` and runs the checks those paths need (table below), reporting content findings only for the files you touched. `--all` runs every gate, and CI runs exactly `verify --all`, so the list in `scripts/lib/verify-plan.ts` is the only one to change; `--list` shows the plan; `--json` is for agents. On GitHub Actions, findings with a file also annotate the PR.
4. For release-critical work, also run:
   - `bun run validate:release`
   - `bun run check:upgrade -- --release`
5. If you changed the reader UI (`components/`, `layouts/`, `styles/`, or a page template), run `bun run check:a11y`. It builds every book and runs axe-core over each page type in light and dark, at desktop and phone widths, failing on serious or critical violations. It needs Playwright's Chromium once: `bunx playwright install chromium`. CI runs it in its own job.

### Pre-flight: classify the change before coding

Use this sequence to reduce rework:

1. **Name the bet** from [`docs/bets.md`](./docs/bets.md) this serves, or label the change maintenance.
2. **Pick risk level** (low / medium / high).
3. **Choose lane** (A/B/C below).
4. **Decide test depth** using the matrix in [Verification matrix](#verification-matrix).
5. **Write one-line intent note** (helps reviewers validate scope quickly).

---

## Choose a contribution lane

## Lane A — Content improvements (low risk)

Examples:

- chapter edits
- case/example additions
- glossary polish
- copy/style improvements

Typical paths:

- `apps/<book>/src/content/book/chapters/**`
- `apps/<book>/src/content/book/examples/**`
- `apps/<book>/src/content/book/glossary/**`

Rules:

- Do not introduce floating named concepts.
- Do not redefine mechanisms from prose.
- Keep examples replaceable.

## Lane B — Mechanisms and tools (medium risk)

Examples:

- adding a mechanism
- adding an action primitive/tool
- clarifying mechanism boundaries

Typical paths:

- `apps/<book>/src/content/book/mechanisms/**`
- `apps/<book>/src/content/book/toolkit/**`

Mechanism quality bar:

- stable slug identifier
- one-sentence definition
- explicit boundaries (`is` / `is not`)
- 1–3 testable predictions

Tool quality bar:

- explicit trigger
- executable steps (≤10 minutes)
- clear failure mode
- legitimate demand unlocked

If meaning changes for an existing mechanism, treat it as breaking and document migration guidance.

## Lane C — Engine / schema / frame changes (high risk)

Examples:

- frame requirement changes
- schema shape changes
- validation strictness updates
- ordering/entrypoint behavior changes

Typical paths:

- `packages/astro-bookkit/src/frames/**`
- `packages/astro-bookkit/src/validators/**`
- `packages/astro-bookkit/src/book/**`
- `packages/astro-bookkit/src/mcp/**`
- `packages/astro-bookkit/src/releases/**`

Requirements:

- stay book-agnostic
- keep validation errors actionable
- include rationale in comments or PR notes
- include before/after behavior in commit/PR description
- respect engine module tiers — imports point strictly down; see the module map in [`docs/architecture.md`](./docs/architecture.md)
- if you add, rename, remove, or re-layer a module, update `docs/architecture.md` in the same change

---

## Verification matrix

`bun run verify` runs the right set for you; the mapping lives in `scripts/lib/verify-plan.ts`:

| Changed path | Checks |
| --- | --- |
| any formattable file | Biome format, import order, lint (changed files only) |
| `packages/astro-bookkit/**` | types, tests, shims, architecture doc, build `on-call` |
| `packages/create-bookkit/**`, `scripts/**` | types (`.ts` only), tests |
| `apps/<book>/src/content/**` | validate that book, separation, named concepts (warnings only), build that book |
| a mechanism file, `corpus.json`, `corpus-judgments.json` | mechanisms across books (wording, and judges' verdicts) |
| `apps/<book>/**` (config, pages, lib) | types, shims, validate, build that book |
| `docs/architecture.md` | architecture doc |
| `TODOS.md` | todos |
| `package.json`, `bun.lock`, `tsconfig.base.json`, `biome.json`, `.github/**` | as for engine code |
| `--all` (what CI runs) | every row above for every book, plus mechanisms across books and named concepts |

By lane, beyond `verify`:

| Lane | Minimum checks | Escalate to |
| --- | --- | --- |
| A (content) | `bun run validate`, `bun run lint`, `bun run test` | `bun run validate:release` when editing mechanism-adjacent prose |
| B (mechanisms/tools) | `bun run validate`, `bun run lint`, `bun run check:types`, `bun run test` | `bun run validate:release` when changing definitions/boundaries |
| C (engine/schema/frame) | `bun run validate`, `bun run validate:release`, `bun run lint`, `bun run check:types`, `bun run check:architecture`, `bun run test` | `bun run check:upgrade -- --release` for behavior-affecting changes |

If checks fail due to intended strictness changes, update error text so it stays actionable.

---

## Validation modes

- `bun run validate` → warn mode for active drafting.
- `bun run validate:release` → error mode for release gates.

If validation fails, fix the structure; do not weaken rules just to pass.

Common fixes:

- missing action primitive → add executable ≤10-minute tool step
- missing frame step → add required structural section
- unregistered concept → register as mechanism or glossary term

---

## New book scaffold checklist

After running `bun run new:book -- --book <slug> --title "..."`:

- update `src/book.config.ts`
- replace starter files in `chapters/`, `mechanisms/`, `toolkit/`, `examples/`, `glossary/`, `releases/`
- run `bun run validate` and `bun run validate:release`
- verify `bun run bookkit dev <slug>` and `bun run bookkit build <slug>`

---

## Submission expectations

- Keep PRs scoped and reviewable.
- Explain intent and risk level (low/medium/high).
- For risky changes, include a short before/after summary.
- If you change schemas/validation, include migration notes when needed.

### Recommended PR description structure

Use a concise structure to improve review speed:

1. **What changed** (2–5 bullets)
2. **Why now** (problem being solved)
3. **Risk level** (low/medium/high)
4. **Before/after behavior** (required for medium/high)
5. **Validation run** (exact commands)
6. **Migration notes** (only when schema/validator behavior changes)

---

## Documentation governance

The canonical documents and their roles are listed once, in `AGENTS.md` → "Canonical document roles". Link to them instead of duplicating policy text, and don't add audit, PRD, or critique documents for work that serves no bet in `docs/bets.md`; record findings as rows in `docs/tech-debt-register.md` instead.

---

## CI

GitHub Actions runs on every push and PR to `main` with the full quality gate:

1. `bun run lint` — Biome style check
2. `bun run check:types` — `.ts` (TypeScript 7) and `.astro` (`astro check`) across all apps + package
3. `bun run check:separation` — content boundary enforcement
4. `bun run check:architecture` — architecture doc matches the tree
5. `bun run check:todos` — TODO policy
6. `bun run check:shims` — shim consistency
7. `bun run validate` — schema + frame validation
8. `bun run test` — Bun test runner across all test files
9. `bun run build:all` — static build of every book
10. `bun run check:build` — every `dist/` is deployable (no lockout pages, real exports, SEO artifacts, one site URL)

A separate job runs `bun run check:a11y` (axe-core over every page type and the open panels, light and dark, desktop and phone).

PRs that break CI need a fix before merge. Do not chain multiple fix-attempt commits.
