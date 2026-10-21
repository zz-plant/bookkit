# Contributing to Bookkit

You do not need full-system context to contribute safely. Pick a lane, run checks, and keep architecture boundaries intact.

For commands see [`README.md`](./README.md), and for what each check enforces, [`docs/guide/`](./docs/guide/). For how the system is structured — layers, engine module map, import tiers — see [`docs/architecture.md`](./docs/architecture.md). For hard invariants see [`AGENTS.md`](./AGENTS.md).

---

## Fast-start workflow

1. Install dependencies: `bun install` (this also installs the pre-commit hook).
2. Make a focused change.
3. Run `bun run verify`. It reads what changed since `origin/main` and runs the checks those paths need (table below), reporting content findings only for the files you touched. `--all` runs every gate. The gates live in one list, `scripts/lib/verify-plan.ts`; CI runs `verify --all` and the other jobs under [CI](#ci). `--list` shows the plan; `--json` is for agents. On GitHub Actions, findings with a file also annotate the PR.
4. Release rules follow each book's `status`, so `verify` already applies them to a published or stable book. `bun run validate:release` is an alias of `bun run validate`, and `check:upgrade` runs a subset of `verify --all`.
5. If you changed the reader UI (`components/`, `layouts/`, `styles/`, or a page template), run `bun run check:a11y`. It builds every book and runs axe-core over each page type in light and dark, at desktop and phone widths, failing on serious or critical violations. It needs Playwright's Chromium once: `bunx playwright install chromium`. If you changed search, the reading keys, the Ask panel, or a script that shows text the book did not write (what readers send, the address, what the browser stores), also run `bun run test:browser`, which drives search and the reading keys by keyboard, checks that such text shows as text, and checks that Ask asks before the reader's browser downloads its models. CI runs both in their own job.

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
| A (content) | `bun run validate`, `bun run lint`, `bun run test` | `bun run check:concepts` when prose names a new idea |
| B (mechanisms/tools) | `bun run validate`, `bun run lint`, `bun run check:types`, `bun run test` | `bun run check:corpus` when changing definitions/boundaries |
| C (engine/schema/frame) | `bun run validate`, `bun run lint`, `bun run check:types`, `bun run check:architecture`, `bun run test` | `bun run verify -- --all` for behavior-affecting changes |

If checks fail due to intended strictness changes, update error text so it stays actionable.

## Tests

Tests sit beside the code they cover (`*.test.ts`), and `bun run test` runs every file in parallel. `bunfig.toml` preloads `scripts/lib/test-preload.ts`, which gives each test file its own `BOOKKIT_DATA_DIR`, so no test reads another's reader data, and fails the run when a test file creates or deletes anything in the repository's `apps/` (build, export, and proposal output aside). A behavior fix comes with a test that fails without it.

- **Child processes.** A test that runs a script, git, or a shell and waits for it uses `runChild` from `scripts/lib/child-process.fixture.ts` (`runChildAsync` for children that run side by side, or a server the test talks to), and its file calls `waitForChildren()` once. The deadline belongs to the child: 60 s (`CHILD_DEADLINE_MS`), or `BUILD_DEADLINE_MS` (180 s) for a build, after which it is killed and the test names the command. Do not add per-test timeouts for it.
- **Books.** A test that creates, changes, or builds a book does it in a temporary workspace, never in `apps/`: `createBookWorkspace` scaffolds one (link-preview images off unless `{ linkPreviews: true }`) and `copyBooks` copies the repository's books (`scripts/lib/book-workspace.fixture.ts`). Test files run in parallel, and two builds of one book folder share its `.astro/` and `node_modules/` caches. Such a workspace holds a marker file, and scripts that `runChild` starts in it resolve nothing outside it: once the workspace is deleted they stop with an error instead of acting on the repository around it.
- **MDX.** A test that compiles MDX for a scratch book needs no `node_modules` link: `compileMdx` uses the repository's compiler.
- **Unsafe HTML.** A new way past the HTML allowlist goes in `packages/astro-bookkit/src/utils/fixtures/unsafe-html.ts`; the site, check, export, and GitBook tests all read it.
- **Browser tests** are `*.browser.ts` files listed in the `test:browser` script, outside `bun run test`. One calls `builtBookTests(book)` from `scripts/lib/browser.fixture.ts`, which builds and serves the book and starts Chromium before its cases (`builtBookTests(book, { runtime: "server" })` builds a copy as a server runtime would, for the Ask panel and the other features that need one, and serves its pages; a case answers its API routes with `page.route`), and writes each case with the returned `it(name, async (browser) => …)`. A case gets a time budget scaled to how fast the machine loaded the book, and runs once more in a new Chromium after a timeout or a lost browser, never after a failed assertion. A run still going 30 s after the last book closes exits with code 1.

---

## Validation and book status

A book's `status` in `book.config.ts` decides the rules. A published or stable book gets release rules: no draft record in any section, broken links and unknown prerequisites are errors, and it must be indexable at a public URL. In a draft or in-review book, draft records are allowed, and broken links and unknown prerequisites are warnings. Errors exit 1 whatever the status. `validate:release` is the same command as `validate`; [Status](./docs/guide/concepts.md#status) has the full table.

If validation fails, fix the structure; do not weaken a rule to make it pass.

Common fixes:

- missing action primitive → add executable ≤10-minute tool step
- missing frame step → add required structural section
- unregistered concept → register as mechanism or glossary term

---

## New book scaffold checklist

After running `bun run bookkit new book <slug> --title "..."` (or `bun run new:book -- --book <slug> --title "..."`):

- commit the `bun.lock` change with the book: the scaffold's `bun install` adds the app to it, and CI installs with `--frozen-lockfile`
- update `src/book.config.ts`; `bun run validate` names each placeholder left in it
- replace starter files in `chapters/`, `mechanisms/`, `toolkit/`, `examples/`, `glossary/`, `releases/`
- run `bun run validate`, then `bun run bookkit dev <slug>` and `bun run bookkit build <slug>`

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

## Agent setup

`bun run setup:codex` installs dependencies, links the lane skills in `.codex/skills/` into `$CODEX_HOME`, and runs `validate` and `check:separation`. `bash scripts/codex-setup.sh --skip-install --skip-checks` only links the skills.

## Documentation governance

The canonical documents and their roles are listed once, in `AGENTS.md` → "Canonical document roles". Link to them instead of duplicating policy text, and don't add audit, PRD, or critique documents for work that serves no bet in `docs/bets.md`; record findings as rows in `docs/tech-debt-register.md` instead.

---

## CI

`.github/workflows/ci.yml` runs on every push and pull request to `main`, in five jobs:

| Job | What it runs |
| --- | --- |
| `audit` | `bun audit --audit-level=high`: fails on a high or critical advisory in `bun.lock`. |
| `governance-and-tests` | `bun run verify -- --all` (every gate in `scripts/lib/verify-plan.ts`, including the build of every book and `check:build`), then `bookkit deploy --all --dry-run`, which must reach wrangler for every book with the commit's message. |
| `accessibility` | `bun run check:a11y` (axe-core over every page type and the open panels, light and dark, desktop and phone) and `bun run test:browser` (search and the reading keys, by keyboard; text from readers, the address, and storage shown as text; the Ask panel's download question, on a server build). |
| `semantic-corpus` | `check:corpus --mode error` with the embedding model downloaded, so mechanisms are compared by meaning; it fails if the meaning pass did not run. |
| `standalone-project` | Scaffolds a project with `create-bookkit`, builds it failing on any `[WARN]` line, runs its `verify -- --all` before `git init`, then commits it and runs `deploy -- --dry-run`. |

`.github/workflows/deploy.yml` publishes after CI passes on `main`, only for the books the `DEPLOY_BOOKS` repository variable names ([Deploy from CI](./docs/guide/publishing.md#deploy-from-ci)).

A ruleset on `main` takes changes only by pull request, needs all five jobs above to pass, and refuses force-pushes and deletion. A job renamed in `ci.yml` must be renamed in the ruleset too (Settings → Rules), or every PR waits on a check that never reports. PRs merge with a merge commit. Dependabot (`.github/dependabot.yml`) opens one grouped PR a week for GitHub Actions. For `bun.lock` it opens one PR per major update, and groups minor and patch updates into `astro`, `tooling`, and `runtime`; it skips TypeScript 7 and mermaid, and the file says why.

PRs that break CI need a fix before merge. Do not chain multiple fix-attempt commits.
