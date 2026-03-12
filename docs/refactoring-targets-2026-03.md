# Refactoring targets — 2026-03

This document captures concrete refactoring targets discovered from current workspace structure and existing debt tracking.

## Prioritized targets

### 1) Collapse duplicated app shim files into bookkit generators or shared route wrappers

**Why this is debt**
- Both books carry many byte-identical route/API shim files and lib re-export files.
- Every shared capability change requires touching duplicate file surfaces in each app.

**Evidence**
- Identical API route shims in both books, e.g. `apps/bad-people/src/pages/api/analytics.json.ts` and `apps/running-hot/src/pages/api/analytics.json.ts`.
- Identical lib pass-through files in both books, e.g. `apps/bad-people/src/lib/og.ts` and `apps/running-hot/src/lib/og.ts`.

**Refactor direction**
- Add engine-supported route/file generation (or a shared app preset package) for stable shims.
- Keep app layer limited to `book.config.ts` + book content + truly book-specific pages.

**Risk**
- Medium: touching route wiring can break build/runtime if import paths or Astro route conventions are wrong.

---

### 2) Extract legacy redirect page pattern into reusable primitive

**Why this is debt**
- Redirect pages in `running-hot` repeat full HTML boilerplate per route.
- Current pattern is easy to copy incorrectly and creates noisy maintenance for route moves.

**Evidence**
- `apps/running-hot/src/pages/chapters.astro`
- `apps/running-hot/src/pages/mechanisms.astro`
- Similar page shape appears for `glossary.astro` and `toolkit.astro`.

**Refactor direction**
- Add shared `RedirectPage.astro` primitive in engine package (or app-shared component) with typed props for destination/status semantics.
- Optionally provide a compile-time redirect manifest abstraction to reduce per-page boilerplate.

**Risk**
- Low/Medium: mostly mechanical, but SEO/canonical behavior should be validated.

---

### 3) Decompose high-churn, high-size workspace scripts

**Why this is debt**
- Large scripts are currently carrying parsing, validation, formatting, and orchestration logic in single files.
- This increases review load and raises regression risk when adding validation rules.

**Evidence**
- `scripts/validate-book.ts` (largest script in workspace).
- `scripts/scaffold-book.ts` and `scripts/audit-unused.ts` are also relatively large multi-concern scripts.

**Refactor direction**
- Split scripts into focused modules under `scripts/lib/` (argument parsing, file discovery, diagnostics formatting, rule execution).
- Preserve CLI entry points as thin wrappers.

**Risk**
- Medium: behavior must stay byte-for-byte compatible for existing developer workflows.

---

### 4) Continue consolidating audit findings into one executable backlog

**Why this is debt**
- Existing debt tracking already calls out fragmented audit findings.
- Audit docs can still become duplicated narrative unless tied to one closure path.

**Evidence**
- `docs/tech-debt-register.md` lists open cross-cutting debt TD-003 for fragmented audit findings.
- Book TODO files still carry related UX follow-through tasks.

**Refactor direction**
- Treat `docs/tech-debt-register.md` as the single queue and demote audit docs to evidence-only artifacts.
- Require each new audit finding to map to one debt row and one owner/milestone.

**Risk**
- Low: process/documentation alignment, minimal runtime impact.

## Suggested execution order

1. Target 1 (highest leverage, reduces repeated edits across books).
2. Target 2 (quick win with low blast radius).
3. Target 3 (internal maintainability and safer rule evolution).
4. Target 4 (ongoing governance hygiene).

## Definition of done (for each target)

- No behavior regressions in `bun run validate`, `bun run check:separation`, and `bun run check:types`.
- Fewer duplicated files or duplicated lines in touched scope.
- Migration notes captured in PR body if command/output behavior changes.
