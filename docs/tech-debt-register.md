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

## Update protocol

1. Add new debt items here first.
2. Link audit/critique docs to the corresponding register row.
3. Mark status transitions explicitly (`Open` → `In progress` → `Done`) and capture closure evidence in notes.

## Consolidated open work snapshot

- **Roadmap track status:** `docs/commercial-roadmap.md`
  - Track 1 complete
  - Track 2 in progress
  - Track 3 next
- **Per-book open work:**
  - `apps/bad-people/TODOS.md`
  - `apps/running-hot/TODOS.md`
- **Cross-cutting open debt IDs:** _None currently open._
