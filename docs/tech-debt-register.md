# Tech debt register

Use this register as the single prioritized queue for cross-cutting debt remediation.

| ID | Issue | Severity | Owner | Source | Target milestone | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TD-001 | Backlog fidelity drift in per-book TODO trackers | Medium | Book maintainers | `apps/bad-people/TODOS.md`, `apps/running-hot/TODOS.md` | 2026-03 docs hygiene | In progress | Metadata tags are now present and completed checklist entries were removed from active TODOs; ongoing discipline is to keep completed work in release/changelog artifacts only. |
| TD-002 | README/workspace architecture example drift | Low | Workspace maintainers | `README.md` | 2026-03 docs hygiene | In progress | Repo layout example now includes both current books. |
| TD-003 | Audit findings are fragmented across docs/specs | Medium | Product + docs maintainers | `docs/ux-audit-bad-people.md`, `docs/ux-audit-bad-people-round-2.md`, `docs/route-audit-2026-02-15.md`, `apps/*/specs/feature-audit.md`, `apps/*/specs/seo-audit-2026-02.md` | 2026-04 planning | In progress | Added direct links and “Open issues tracked in tech-debt register” notes in each listed audit/spec doc; continue consolidating findings into the register. |
| TD-004 | Governance checks not guaranteed via CI gates | Medium | Platform maintainers | `.github/workflows/governance-checks.yml` | 2026-04 platform hardening | In progress | CI now enforces `bun run validate`, `bun run check:separation`, and `bun run check:types` on pull requests and pushes to `main`. |

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
- **Cross-cutting open debt IDs:** TD-001, TD-003, TD-004
