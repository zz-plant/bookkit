# Tech debt register

Use this register as the single prioritized queue for cross-cutting debt remediation.

| ID | Issue | Severity | Owner | Source | Target milestone | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TD-001 | Backlog fidelity drift in per-book TODO trackers | Medium | Book maintainers | `apps/bad-people/TODOS.md`, `apps/running-hot/TODOS.md` | 2026-03 docs hygiene | Done | TODO files now use active-backlog format, include owner/milestone metadata, and link items to debt IDs. |
| TD-002 | README/workspace architecture example drift | Low | Workspace maintainers | `README.md` | 2026-03 docs hygiene | In progress | Repo layout example now includes both current books. |
| TD-003 | Audit findings are fragmented across docs/specs | Medium | Product + docs maintainers | `docs/ux-audit-bad-people.md`, `docs/ux-audit-bad-people-round-2.md`, `docs/route-audit-2026-02-15.md`, `apps/*/specs/feature-audit.md`, `apps/*/specs/seo-audit-2026-02.md` | 2026-04 planning | Open | Link each audit's open findings back to this register. |
| TD-004 | Governance checks not guaranteed via CI gates | Medium | Platform maintainers | `package.json` | 2026-04 platform hardening | Open | Proposed checks: `validate`, `check:separation`, `check:types`. |

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
- **Cross-cutting open debt IDs:** TD-003, TD-004
