# Tech debt register

Use this register as the single prioritized queue for cross-cutting debt remediation.

| ID | Issue | Severity | Owner | Source | Target milestone | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TD-001 | Backlog fidelity drift in per-book TODO trackers | Medium | Book maintainers | `apps/bad-people/TODOS.md`, `apps/running-hot/TODOS.md`, `scripts/check-todos.ts` | 2026-03 docs hygiene | Done | Added `bun run check:todos` to enforce TODO metadata tags and block completed checklist entries in active trackers; wired into CI governance checks. |
| TD-002 | README/workspace architecture example drift | Low | Workspace maintainers | `README.md` | 2026-03 docs hygiene | Done | Repo layout example includes both current books and remains aligned with current workspace structure. |
| TD-003 | Audit findings are fragmented across docs/specs | Medium | Product + docs maintainers | `docs/audit-findings-consolidated.md` | 2026-04 planning | Done | Replaced fragmented historical audit documents with a single consolidated audit backlog and retained debt-register-first protocol for new findings. |
| TD-004 | Governance checks not guaranteed via CI gates | Medium | Platform maintainers | `.github/workflows/governance-checks.yml` | 2026-04 platform hardening | Done | CI enforces `bun run validate`, `bun run check:separation`, `bun run check:types`, `bun run check:todos`, and `bun run check:shims` on pull requests and pushes to `main`. |
| TD-005 | Duplicated app-level shim routes/libs across books | Medium | Platform maintainers | `scripts/check-shims.ts`, `apps/*/src/pages/api/*.ts`, `apps/*/src/lib/{book-entrypoints,exports,og,release-notes,versions}.ts` | 2026-04 platform hardening | Done | Added shim consistency tooling (`bun run check:shims` / `bun run sync:shims`) with canonical source propagation to remove manual divergence risk. |
| TD-006 | Monolithic workspace scripts increase change risk | Medium | Workspace maintainers | `scripts/lib/content-frontmatter.ts`, `scripts/validate-book.ts`, `scripts/audit-unused.ts` | 2026-04 tooling hardening | Done | Extracted shared content file traversal/frontmatter parsing utilities and migrated validation/audit scripts to composable modules. |

| TD-007 | Architecture documentation drifts silently across four unsynchronised docs | Medium | Workspace maintainers | `docs/architecture.md`, `scripts/check-architecture.ts`, `README.md`, `packages/astro-bookkit/src/README.md` | 2026-09 docs hygiene | Done | Recurrence of TD-002, which was closed by manual correction and drifted again: the README repo-layout tree listed 9 of 26 engine modules, and the engine source map listed 6 while crediting the empty `compiler/` directory with compile/ordering/export logic that lives in `book/` and `exports/`. Closed structurally rather than by editing prose: `docs/architecture.md` is now canonical and `bun run check:architecture` fails CI when the module map, import tiers, declared cycles, workspace paths, or content sections stop matching the tree. |
| TD-008 | `reviewEveryDays` is declared on runbook tools but never enforced | Low | Platform maintainers | `packages/astro-bookkit/src/schemas/toolkit.ts`, `packages/astro-bookkit/src/suggestions/runbook-coverage.ts`, `apps/on-call/TODOS.md` | 2026-10 runbook hardening | Done | Closed 2026-09-14: `deriveReviewCadence` computes each tool's next review due date from the latest release narrative (`date` + `reviewEveryDays`), and `auditReviewCadence` emits one warning per overdue procedure; `deriveComplianceMatrix` annotates rows with the earliest due date plus an `reviewOverdue` flag when releases are passed (back-compat: rows stay unannotated otherwise). `check:runbooks` prints the annotations and includes them in the exported artifact. |

| TD-009 | Pre-commit formatting fights `check:shims`, making the gate unpassable for any touched book | Medium | Platform maintainers | `packages/astro-bookkit/templates/book-app/**`, `scripts/check-shims.ts`, `.lintstagedrc.json` | 2026-09 docs hygiene | Done | `check:shims` compares app shims byte-for-byte against the canonical templates, but the templates were space-indented with unsorted imports while `biome.json` specifies tabs and `organizeImports`. The husky/lint-staged hook runs `biome check --write` on staged files only, so committing any book's shim reformatted it out of step with its own template — an unbreakable loop that surfaced the moment `apps/on-call/` was added. Fixed by formatting the canonical templates with Biome and re-syncing, so `sync:shims` output is now a fixed point of the formatter. Keep the templates Biome-formatted; if they are ever hand-edited back to spaces the loop returns. |

| TD-010 | Markdown-only commits fail the pre-commit hook | Low | Platform maintainers | `.lintstagedrc.json`, `.husky/pre-commit` | 2026-09 docs hygiene | Done | `.lintstagedrc.json` routes `*.md` to `biome check --write`, but Biome does not process Markdown; when a commit stages Markdown and no JSON/YAML alongside it, Biome exits 1 with "No files were processed in the specified paths" and husky aborts the commit. In a documentation-heavy repo this blocks the most common kind of commit. Fixed by adding `--no-errors-on-unmatched` to both lint-staged globs, which keeps formatting behaviour identical while treating an empty match set as success. |

| TD-011 | Static builds were never gated: two books built into 100% preview-lockout output, the PDF export crashed on `→`, preview tokens were rendered into public HTML, and one book carried another book's site URL | High | Platform maintainers | `packages/astro-bookkit/src/preview/access.ts`, `packages/astro-bookkit/src/exports/pdf-generator.ts`, `packages/astro-bookkit/src/components/PreviewLinksPanel.astro`, `apps/*/astro.config.mjs`, `scripts/check-build.ts`, `.github/workflows/ci.yml` | 2026-09 deployment readiness | Done | Closed 2026-09-14. Root cause: CI ran every governance gate but never `astro build`, so build-time middleware behaviour (Astro prerenders through middleware) and export-time font limits had no observer. Fixed structurally: `createPreviewAccessMiddleware` bypasses prerendered routes, `toWinAnsiText` guards PDF text, `PreviewLinksPanel` masks tokens outside local dev, `astro.config.mjs` derives `site` from `book.config.ts` and is shim-managed, and `bun run check:build` verifies every `dist/` in CI. Deployment target and commands documented in README → Deploy. |

## Update protocol

1. Add new debt items here first.
2. Link audit/critique docs to the corresponding register row.
3. Mark status transitions explicitly (`Open` → `In progress` → `Done`) and capture closure evidence in notes.

## Consolidated open work snapshot

- **Roadmap track status:** `docs/commercial-roadmap.md`
  - Track 1 complete
  - Track 2 in progress
  - Track 3 next
  - Track 5 shipped 2026-09-04
- **Per-book open work:**
  - `apps/bad-people/TODOS.md`
  - `apps/crumple-zone/TODOS.md`
  - `apps/on-call/TODOS.md`
  - `apps/running-hot/TODOS.md`
- **Cross-cutting open debt IDs:** none.
