# Changelog

Dated, documented behavior changes to the Bookkit engine, schemas, validators, and scripts.
Per-book editorial history lives in each app's `src/content/book/releases/`.

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