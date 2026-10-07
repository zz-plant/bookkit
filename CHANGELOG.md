# Changelog

Dated, documented behavior changes to the Bookkit engine, schemas, validators, and scripts.
Per-book editorial history lives in each app's `src/content/book/releases/`.

## 2026-10-07 — `check:corpus` runs a stronger model, measured against the author's merges (bet B1)

- **Default model is now `nomic-ai/nomic-embed-text-v1.5`** (full precision, cutoff 0.80), replacing `Xenova/all-MiniLM-L6-v2` (cutoff 0.45). The old model missed the `human-heat-sink` / `crumple-zone` merge: it scored the pair 0.36, and 56 pairs in today's corpus scored higher. nomic ranks both recorded merges in the top two and, at 0.80, flags only one pair today, which is already ruled distinct, so `check:corpus --mode error` still passes. It runs through the same `@xenova/transformers` dependency; no new package. The first run downloads about 520 MB instead of 25 MB, and a full run takes about 10s on CPU.
- **New flag: `--model <key>`** picks a model from `EMBEDDING_MODELS` in `scripts/lib/embed-text.ts` (`nomic`, `minilm`, `bge-base`). Each model carries its own task prefix, pooling, precision, and cutoff, because similarity scales differ by model. `--threshold` still overrides the cutoff.
- **New mode: `--eval`** scores each model (or the ones named in `--model a,b`) against the author's rulings: each merge's score and how many pairs in today's corpus score higher, the top pair ruled distinct, and how many pairs it flags at its own cutoff and at the cutoff that catches every merge, split into ruled and unreviewed. The scoring is `evaluateCorpusModel` in `scripts/lib/corpus-eval.ts`.
- **`corpus.json` gains `merged`:** each merge the author made, with the date, the reason, and both mechanisms (`book`, `slug`, `title`, `definition`, `is`) as they were before it. The two merges of 2026-10-07 (`delay-as-force`, `crumple-zone`) are recorded from commit `3aa6bb3`. Normal runs ignore it.
- `corpusEmbeddingText` accepts any object with `title`, `definition`, and `is` (it took a full `MechanismRecord`); existing callers are unaffected.

**Migration:** none for books. To keep the earlier behaviour, pass `--model minilm`. A cutoff passed with `--threshold` is now read on the chosen model's scale: 0.45 means something different for nomic than for MiniLM.

## 2026-10-07 — `.astro` files are type-checked

- **`bun run check:types` now checks `.astro` files.** After the TypeScript 7 pass, it runs `astro check` on every book and on the engine, in parallel. The 116 `.astro` files (24 engine components and layouts, 92 book pages) had never been type-checked: each book had about 265 errors and the engine 109. All are fixed, and the gate fails on new ones. `-- --no-astro` skips this pass for a quick loop. About 27s locally.
- **Content modules are typed.** `BookContentModules` was `Record<string, unknown>` for every section, so pages saw untyped, possibly-undefined frontmatter. Each section is now `MDXInstance<AuthoredFrontmatter<schema>>`: the schema's input type (fields with defaults are optional, since pages read raw frontmatter) plus `locale`. The engine exports `ChapterModule`, `MechanismModule`, `ToolkitModule`, `GlossaryModule`, `ExampleModule`, and `AuthoredFrontmatter`. The `book-runtime.ts` shim passes them to `import.meta.glob`.
- **`Astro.locals` is typed.** The engine's `astro-env.d.ts` augmented a `Locals` interface Astro does not read. It now declares the global `App.Locals` (`locale`, `localePath`, `originalUrl`, `bookVersion`, `preview`). Books load it with `"types": ["astro/client", "@bookkit/astro-bookkit/env"]` in their tsconfig.
- **Bugs the check found, now fixed:**
  - A tool with a `title` and no `name` (which the schema allows) rendered as "undefined" in its page title, an empty `<h1>`, and "Untitled action" in lists. All 10 Crumple Zone tools were affected. New `toolkitDisplayName()` applies the schema's rule (`name`, else `title`) everywhere a tool is named.
  - Example pages never showed the "not yet translated" notice: they looked up `frontmatter.slug`, which examples do not have. They now use the route's slug. Glossary pages, whose `slug` is optional, do the same.
- `exampleSchema` gains an optional `summary` (the page already read it for the meta description); the unused `description` fallback is dropped.
- Engine types accept readonly locale lists (`as const` book configs), and `createBookLayoutState` takes `App.Locals`.

**Migration (books outside this repo):** add `"@bookkit/astro-bookkit/env"` to `compilerOptions.types` in the book's tsconfig, and re-sync shims (`bun run sync:shims`) so `book-runtime.ts` types its globs. Pages that read `module.frontmatter ?? {}` keep working; the fallback is no longer needed.

## 2026-10-07 — Typecheck on TypeScript 7

- **`bun run check:types` uses TypeScript 7.0.2, the native compiler.** The same five projects typecheck in about 4s instead of about 18s locally; in CI, typecheck was 26s of a 53s run. It reports the same errors as TypeScript 5 on the current tree and on planted errors.
- TypeScript 7 is the devDependency `typescript-native` (an npm alias, pinned). The `typescript` package stays on 5.x because `scripts/validate-book.ts` parses `book.config.ts` with the 5.x compiler API, which 7.x replaced. Editors keep using 5.x.
- `bun run check:types -- --tsc` runs the old TypeScript 5 check, as a fallback.
- Neither compiler reads `.astro` files (see the entry above for `astro check`).

## 2026-10-07 — Docs streamlined

- **Removed 65 files (~33k words)**, all recoverable from git at `2ca1b3e`:
  - 42 spec/PRD files: `bad-people`'s 14 copied verbatim into `running-hot` and `crumple-zone`, plus the engine's feature-spec snapshot.
  - Three identical `USER_JOURNEY_CRITIQUE.md` files.
  - Eight UI critiques and reviews from February and March.
  - Superseded planning docs: `priority-agent-features`, `prd-completion-user-stories-and-specs`, `audit-findings-consolidated`, `refactoring-targets-2026-03`, `mcp-agent-skills-research`, and the shipped and parked gap analyses for the runbook wedge and reader forking.
  - Root `UX_AUDIT.md`, `FRONTEND_INEFFICIENCIES.md`, `SCRATCHPAD.md`, and `STACK_CAPABILITIES_RESEARCH.md`.
- **README:**
  - "Headline numbers" claimed 140 tests and "two teaching books"; it is now "What's here".
  - "Commercial direction" called the runbook wedge the first product while that bet is parked; it is now "Direction", pointing to `docs/bets.md`.
  - Five sections that repeated `AGENTS.md`, `CONTRIBUTING.md`, or `CHANGELOG.md` are removed: the decision guide, the risk rule of thumb, the second compile diagram, the migration notes, and the contribution model.
  - The doc map lists the canonical set: the README, `AGENTS.md`, `CONTRIBUTING.md`, architecture, design notes, authorship model, bets, roadmap, debt register, CHANGELOG, skills, and package and book READMEs.
- **One list of canonical documents.** It now lives in `AGENTS.md`, which also lists the CHANGELOG as where migration notes go. CONTRIBUTING links to that list instead of keeping its own copy.
- **MCP governance resources:** the stale stack scan and MCP research note are replaced with `docs/architecture.md`, `docs/bets.md`, and `docs/design-notes.md`.
- **`bun run stack:capabilities`** prints its report instead of rewriting a root file.
- **Book TODO trackers:** the stale audit items are dropped (the mobile header item was done by the typography pass), Crumple Zone's file no longer says "Bad People", and `on-call` loses its item to re-review a retired doc.

## 2026-10-07 — Content: `human-heat-sink` combined into `crumple-zone` (bet B1)

- `running-hot/human-heat-sink` and `crumple-zone/crumple-zone` are one mechanism, `crumple-zone`, with an identical contract in both books. The definition and lists are merged, and the measurable predictions and tests come from Running Hot. Each book keeps its own body prose.
- `bad-people/transfer-success` stays distinct; the ruling and its reason are in `corpus.json`.
- `check:corpus --mode error` passes: 31 mechanisms, 2 shared, 0 unresolved.

**Migration (running-hot, draft):** the mechanism slug `human-heat-sink` is gone. `/read/mechanisms/human-heat-sink`, `/read/glossary/human-heat-sink`, and the example's `starter-mechanism` path no longer exist; use `crumple-zone`. The glossary entry keeps "human heat sink" as an alias. The tool keeps its slug `human-heat-sink--handle-check` (and URL) and now binds to `crumple-zone`. The scaffold-named mechanism file `starter-mechanism.mdx` is replaced by `crumple-zone.mdx`. Chapter `mechanisms:` lists and `book.config.ts` are updated.

## 2026-10-07 — Corpus overlap: `check:corpus` (bet B1)

**Highlights**

- **New CLI: `bun run check:corpus`** (`scripts/check-corpus.ts`). It runs the mechanism-overlap check across books instead of within one, reports overlapping pairs grouped into clusters, and says how many mechanisms would remain if every cluster were folded into one. Flags: `--books`, `--no-semantic`, `--threshold`, `--json`, `--export`, `--mode error`.
- **Semantic pass.** `scripts/lib/embed-text.ts` embeds each mechanism's title, definition, and `is` list with `Xenova/all-MiniLM-L6-v2` through the engine's optional `@xenova/transformers` dependency, one text per call so a mechanism's vector does not depend on what else is loaded. If the model can't load, the check says why and runs lexical-only.
- **New engine analyzer: `analyzeCorpusOverlap`** (`suggestions/corpus-overlap.ts`). Pure and deterministic: callers inject one vector per mechanism; pairs are flagged by lexical or semantic similarity, then union-found into clusters. Emits `corpus-overlap` suggestions. The lexical scorer moved into a shared `lexicalMechanismSimilarity` helper that `analyzeMechanismOverlap` now uses too (behaviour unchanged).
- **First result** over `bad-people`, `running-hot`, and `crumple-zone`: 6 clusters covering 19 of 33 mechanisms. The lexical pass alone catches 1 of the 14 overlapping pairs.
- **A slug names one mechanism across the corpus.** Books that share a mechanism each carry a copy under the same slug. `check:corpus` counts it once and reports **drift** if the copies' contracts (`title`, `definition`, `is`, `isNot`, `predictions`, `tests`, `satisfies`) differ.
- **`corpus.json`** at the repo root names the default books and records pairs the author ruled distinct, each with a reason. Ruled pairs stop being flagged, and rulings that name a slug that no longer exists are reported as stale. `--mode error` exits 1 on any cluster, drift, or stale ruling.
- **Merge pass (content):** `bad-people/coercive-waiting` is combined into `delay-as-force`, now shared by `bad-people` and `running-hot` with an identical contract. The other 13 flagged pairs are ruled distinct in `corpus.json`.
- The corpus API (`analyzeCorpusOverlap`, `corpusEmbeddingText`, `DEFAULT_SEMANTIC_OVERLAP_THRESHOLD`, and the `Corpus*` types) is exported from the package root, `@bookkit/astro-bookkit`. `analyzeCorpusOverlap` rejects vectors of mixed or zero dimension instead of comparing a shared prefix, which could report false overlap.
- Fixed: the embedding model runs single-threaded. Bun rejects onnxruntime-web's blob-URL workers (`ERR_WORKER_PATH`), which could hang `check:corpus`.

**Migration (bad-people, draft):** the mechanism slug `coercive-waiting` is gone. `/read/mechanisms/coercive-waiting`, `/read/glossary/coercive-waiting`, and the example's `coercive-waiting` path no longer exist; use `delay-as-force`. The glossary entry keeps "coercive waiting" as an alias. The tool keeps its slug `coercive-waiting--deadline-countermove` (and URL) and now binds to `delay-as-force`. Chapter `mechanisms:` lists, `book.config.ts`, and the reading-hub entry point are updated.

**Scope**: new analyzer in `suggestions/`, new script, `corpus.json`, content merge in `bad-people` and `running-hot`, README and architecture-doc lines. No schema, frame, or validator changes, and nothing runs in CI or at build time.

## 2026-10-07 — Reader typography: two voices, one ink, book order

**Highlights**

- **Fonts are now chosen and shipped.** The stylesheet named Inter and Merriweather but never loaded either, so every book rendered in whatever the reader's OS had (usually Times or Georgia). The engine now depends on `@fontsource-variable/newsreader` (Production Type, OFL, optical sizes 6–72) for the book and `@fontsource/fragment-mono` (Wei Huang, OFL) for the apparatus: navigation, breadcrumbs, mechanism contract labels, status, file sizes. `BookLayout` imports both. A typical first page view downloads about 300 KB of fonts (Newsreader roman and italic plus Fragment Mono, Latin subset), cached immutably under `/_astro/`.
- **New colour system: paper, ink, rubric.** `--color-paper`, `--color-ink`, and `--color-rubric` replace the teal accent; muted text, borders, and rules are ink mixed toward paper. `--color-accent*` now resolve to ink, so existing tinted components turn neutral. Shadows and the background gradient are gone (`--shadow-*` resolve to `none`), and hard-coded radii are tokenised as `--radius-control` / `--radius-pill` (2px).
- **Reading surfaces are unboxed.** Chapter, mechanism, hub, and index pages use hairline rules and space instead of cards, pills, and chips. Body text is 19px (18px on phones) at 1.5 leading with a ~68-character measure, old-style figures, `text-wrap: pretty`, hanging punctuation, hung en-dash list markers, and hyphenation on phones.
- **Header becomes a running head.** It shows the short title (text before the first colon) in italic, with the full title in `title`. The version badge is hidden when the reader is on the latest version. `⌘K` is hidden on touch devices. On phones the header is one line and navigation lives only in the bottom bar, which is now a flat full-width strip.
- **Fixed: the Menu was unreachable on desktop.** Release notes, Version and language, Appearance, Ask, and Shortcuts sat in an overflow panel that stayed `hidden` at ≥721px while its toggle was `display: none`. The Menu toggle now shows at every width and opens a dropdown on desktop and a sheet on phones.
- **Fixed: chapters were in alphabetical order.** Chapter prev/next links sorted by slug, and `ContentIndexList` auto-grouped any list over 10 items by first letter, so `running-hot` and `crumple-zone` listed chapters A–Z. Chapter pages now follow `order` when set, else the numbered file order; chapter indexes pass `alphaMode={false}`.
- **New skill: `.codex/skills/reader-typography/SKILL.md`**, exposed as an MCP governance resource. `.claude/skills` is a symlink to `.codex/skills` so Claude Code sessions load the repo's lane skills too.

**Scope**: engine (`styles/`, `components/read-hub/`, `layouts/`, `mcp/governance.ts`), identical edits to `read/chapters/[slug].astro` and `read/chapters/index.astro` in all four books, typographic punctuation in four content titles. No schema, frame, or validator changes.

## 2026-10-05 — Reader UX pass: mobile menu, dark-mode tokens, list filters

**Highlights**

- **Fixed: the header Menu was invisible on phones.** A leftover `.site-nav__overflow { display: none }` from the old `<details>`-based menu (plus dead `[open]` selectors) overrode the bottom-sheet drawer rule, which never re-declared `display` — so on viewports ≤720px the Menu toggle flipped `aria-expanded` but nothing appeared, leaving Release notes, Version/Language, Appearance, Ask, and Shortcuts unreachable. The drawer now carries an explicit `display: grid`; the conflicting and dead rules are gone. Both entry points verified (header toggle and the mobile CTA bar), plus Escape/outside-click close.
- **Fixed: dark mode rendered with hardcoded light colors.** New semantic tokens (`--color-success/-strong`, `--color-danger/-strong`, `--color-warning/-strong`, light + dark variants) replace raw hex/rgba values in: `.list-link` borders (were invisible on dark: `rgba(17,24,39,…)` on every glossary/chapters/mechanisms/toolkit list), `.preview-empty`, `.preview-badge`/`.preview-notice` (amber), `.preview-status--active/expired/revoked`, `.release-chip--new`/`.version-card__chip--new` (green), `.read-meta-chip` variants, `.hero-quick-links .pill`, `.list-density-toggle__button`, `.breadcrumb`, `.mobile-cta`, the New Book studio progress bar, and the skip-link outline. Translucent surfaces now use `color-mix` over `--color-surface` so they adapt to both themes.
- **New engine capability: quick-filter pills on `ContentIndexList`.** The mechanisms index pages shipped ~200 lines of copy-pasted pill markup, script, and CSS in three book apps (with hardcoded colors that broke dark mode). `ContentIndexList` now accepts `quickFilters: { value, label }[]` (plus label overrides), renders tokenized pills, forces the filter input visible when pills are present, and wires pill/clear state through `aria-pressed`. App pages keep only their book-specific tag data; `bad-people`, `on-call`, and `crumple-zone` dropped their duplicated `<script>`/`<style>` blocks (265 → 102 lines for `bad-people`).
- **Simplified: mobile meta clamping is CSS-only.** The per-book "Show more" JS toggle for long list meta is replaced by a two-line `-webkit-line-clamp` on `≤720px` for all list pages; the full text stays one tap away on the item page.
- **Improved: chapter mechanism pills show titles.** Chapter pages rendered raw slugs (`coercive-waiting`); they now resolve each linked mechanism's localized title (slug remains the fallback).
- **Standardized: chapter-page layout moved into the engine.** The four identical per-app `<style>` blocks (incl. a dead `.site-main > h1` rule) and the inline `style=""` on the mechanisms row are replaced by engine classes (`.chapter-mechanisms`, `.chapter-mechanisms__label`, `.chapter-content`, `.next-steps__branches`) and a `.site-main:has(.chapter-shell)` width rule; chapter pages are style-free and byte-identical across books.
- **Removed dead code:** `ReaderUtilityStrip.astro` and `ConceptPopover.astro` (zero usages) and their CSS; the duplicated mobile `.site-nav__more-toggle` block.

**Scope**: engine (`styles/`, `components/`), app-local read pages (`mechanisms/index.astro` in three books, `chapters/[slug].astro` in all four). No schema, frame, or validator changes. `create-bookkit` picks the new pages up automatically (it copies `apps/bad-people`).

**Behavior notes**: pill active state is now carried by `aria-pressed` instead of an `is-active` class; the mechanisms-page tail section is styled by the engine's `.index-tail` instead of per-page CSS; list links use a uniform `--color-border` outline instead of the two-tone bottom border.

## 2026-09-14 — Public deployment readiness (TD-011)

**Highlights**

- **Fixed: static builds locked every visitor out.** Astro runs middleware while prerendering, so a book with `previewAccess.enabled` and no active token rendered its 401 "preview required" page into every file in `dist/` — pages, sitemap, PDF, and EPUB alike. `apps/on-call` (status `published`, token expired 2026-06-30) and `apps/bad-people` shipped 100% lockout output; CI never ran the build, so nothing noticed. `createPreviewAccessMiddleware` now passes prerendered routes through (`context.isPrerendered`) and warns once per build that the gate is not enforceable on static output. `apps/on-call` has `previewAccess` disabled and its dead token removed.
- **Fixed: PDF export crashed on `→`.** pdf-lib's standard fonts are WinAnsi-only; one arrow in chapter prose aborted the whole export (masked until now by the lockout). `toWinAnsiText` transliterates arrows, comparison symbols, and check marks, keeps base letters for unsupported diacritics, drops emoji, and marks anything else with `?`.
- **Fixed: preview tokens were published in built HTML.** `/read/analytics` rendered every tokenized preview link into a public page. `PreviewLinksPanel` gains `revealLinks`; the dashboard passes `import.meta.env.DEV`, so built pages show only the token hint.
- **Fixed: `apps/crumple-zone` used `bad-people.book` as its `site`**, so its sitemap and OG URLs pointed at another book. `astro.config.mjs` now reads `site` from `book.config.ts` and is a shim held identical across books by `check:shims`.
- **New gate: `bun run check:build`** (`scripts/check-build.ts`, `scripts/lib/build-output.ts`) verifies each `dist/`: no lockout pages, real `%PDF`/`PK` export bytes, `404.html` and SEO artifacts present, one host across canonical/robots/sitemap, and no `noindex` on a `published` book. CI now runs `build:all` then `check:build`.
- **New: Cloudflare deployment.** Per-app `wrangler.jsonc` (Workers static assets, `404-page`, `drop-trailing-slash` to match Astro's canonical URLs), `public/_headers` (nosniff, frame, referrer, permissions policies; immutable caching for `/_astro/*`; `noindex` on `*.workers.dev`), a `404.astro` shim, `bun run bookkit deploy [book] [--dry-run] [--no-build]` (build → `check:build` → `wrangler deploy`), and root `qa` / `deploy` scripts that `.opencode/modes/deploy.md` had referenced but which did not exist. `create-bookkit` projects get the same files.
- `bun run new:book` no longer copies the template book's `dist/`, `node_modules/`, or `.astro/`.
- Removed the empty `packages/astro-bookkit/src/compiler/` placeholder that `check:architecture` warned about on every run.

**Scope**: engine (`preview/`, `exports/`, `components/`, `styles/`), app shims, scripts, CI, docs. No schema, frame, or validator changes. Existing books are unaffected apart from `apps/on-call`'s `previewAccess` block and the corrected `crumple-zone` site URL.

## 2026-09-14 — Review-cadence enforcement (TD-008)

**Highlights**

- `deriveReviewCadence` computes each runbook tool's next review due date from the latest release narrative (`date` + `reviewEveryDays`); `auditReviewCadence` emits one warning per overdue procedure.
- `deriveComplianceMatrix` accepts an optional `{ releases, asOf }` third argument and annotates rows with the earliest due date plus a `reviewOverdue` flag; rows stay unannotated when releases are omitted (back-compat).
- `check:runbooks` prints the review annotations on compliance rows and includes `nextReviewDue`/`reviewOverdue` in the exported artifact.
- `docs/tech-debt-register.md`: TD-008 closed; Track 5 recorded as shipped 2026-09-04 in `docs/commercial-roadmap.md`.

## 2026-09-07 — Architecture documentation becomes a gate

**Highlights**
- New canonical document `docs/architecture.md`: three-layer model, the two pipelines (Astro render vs. Bun governance CLI), the full engine module map with import tiers, the content-section contract, and extension points. Replaces the stale repo-layout tree in `README.md`, which listed 9 of the engine's 26 modules.
- New gate `bun run check:architecture` (`scripts/check-architecture.ts`, `--json` supported), added to CI. It verifies the document against the tree: every engine module is mapped and every mapped module exists; imports point strictly down a tier; the declared import cycles are exactly the cycles that exist; and workspace paths and content sections match disk. Machine-checked regions are delimited by `<!-- architecture:*:start -->` markers.
- **New invariant, now enforced**: engine modules are tiered, and a module may only import from a strictly lower tier. Same-tier imports are legal only inside a declared cycle. Two cycles are declared and tolerated — `frames` ↔ `validators` and `book` ↔ `components` ↔ `layouts`; any new cycle fails CI.
- `packages/astro-bookkit/src/README.md` reduced to a pointer; it had drifted to 6 modules and described the empty `compiler/` directory as owning compile/ordering/export logic that actually lives in `book/` and `exports/`.

**Scope**: documentation + one new CI gate. No engine, schema, frame, or validator behavior changes. Known warning: `packages/astro-bookkit/src/compiler/` is an empty placeholder the gate reports on every run until it is removed or implemented.

## 2026-09-07 — Proposal pipeline (`bookkit propose`)

**Highlights**
- New engine module `packages/astro-bookkit/src/proposals/`: composes a reviewable **proposal bundle** from a book's current content — frame detection (runbook vs intervention from keyword signals), mechanism drafts for unregistered recurring concepts, missing prerequisite edges, toolkit bindings for uncovered/proposed mechanisms, and a `book.config.ts` draft.
- New CLI `bun run bookkit propose <book>`: prints the bundle, writes artifacts with `--write` to `apps/<book>/proposals/`, and materializes approved proposals with `--apply mechanisms --apply tools --apply config`. Materialization refuses to overwrite or redefine registered slugs; the live `book.config.ts` stays author-gated. `--detect-frame` evaluates content independent of the declared frame; `--id <proposal>` accepts a specific proposal.
- Shared book-content loader extracted to `scripts/lib/load-book.ts`; `check:suggestions` now consumes it (behavior unchanged).

**Scope**: new engine capability + CLI. No schema, frame, or validator changes — existing books unaffected.

## 2026-09-05 — create-bookkit generator, compliance artifact, frontmatter fidelity

**Highlights**
- New `packages/create-bookkit/` generator (`bun run create-bookkit <dir> --book <slug>`): scaffolds a standalone book project with the engine vendored inline (works offline, no publish required). App surface, config, and checker scripts (`validate`, `suggest`, `runbooks`, `import`) are wired and verified end-to-end against an installed, built, and validated project.
- `bun run check:runbooks --export <file.json>` writes the compliance matrix as a machine-readable artifact (book, generatedAt, covered/total, rows).
- Engine fix in `parseSimpleFrontmatter` (`validateBookInMemory` / MCP `validate_book`): YAML list frontmatter (`is:`, `steps:`, …) is now parsed as arrays and numeric scalars as numbers, so the deterministic verify tool no longer flags valid list-bearing content as schema-invalid. New test coverage in `validators/book-validator.test.ts`.

## 2026-09-04 — Runbook wedge (engine + schemas + proof book)

**Highlights**
- New `runbook` frame: required steps `ownership`, `trigger`, `steps`, `escalation`, `verification`.
- Frame enforcement is now config-driven: the overview chapter is validated against the frame declared in `book.config.ts` (`extractFrameConfigFromSource`), falling back to the intervention frame when none is declared. Runbook books are no longer checked against the intervention frame.

**Backward-compatible schema extensions (all optional with defaults)**
- `toolkitSchema`: `owner`, `reviewEveryDays`, `drills`, `escalation {to, when, withinHours?}`, `satisfies`, `runbookSteps [{when?, action}]`.
- `mechanismSchema`: `satisfies`.
- Existing books are unaffected.

**New surfaces**
- `packages/astro-bookkit/src/suggestions/runbook-coverage.ts`: `auditRunbookCoverage`, `deriveComplianceMatrix`, `summarizeCompliance`, `auditReleaseControlDrift`.
- `scripts/check-runbooks.ts` (`bun run check:runbooks`): audits runbook coverage, derives the compliance matrix, and joins release narratives against HEAD coverage.
- Proof book `apps/on-call/`: 4 control mechanisms, 4 drilled toolkit primitives, runbook-framed chapters, examples, glossary, release.

**Docs**
- `docs/design-notes.md` (invariant rationale), `docs/sop-wedge-gap-analysis.md` (plan + status), README migration notes.

## Prior work (summarized)

- **AI suggestion layer**: deterministic analyzers for mechanism overlap, concept triage (+ candidate mechanism drafts), example-swap auditing, prerequisite edges, and reading-order QA grounding. Ships as `bun run check:suggestions`.
- **MCP tooling**: `bookkit.*` MCP tools incl. `validate_book`, `list_books`, `export_book`, `compile_book`.
- **Recompilable-books core**: engine/author/content separation, Zod schemas, frame validators, graph-based ordering, PDF/EPUB exports, shim enforcement.