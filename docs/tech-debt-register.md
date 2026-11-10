# Tech debt register

The one queue for open cross-cutting debt. Closed rows (TD-001 to TD-012) are in [`docs/changelog/tech-debt-closed.md`](./changelog/tech-debt-closed.md); the next ID is TD-013.

| ID | Issue | Severity | Owner | Source | Target milestone | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |

## Update protocol

1. Add new debt items here first.
2. Link audit/critique docs to the corresponding register row.
3. Mark status transitions explicitly (`Open` → `In progress` → `Done`) and capture closure evidence in notes.
4. Move a `Done` row, unchanged, to `docs/changelog/tech-debt-closed.md`.

## Consolidated open work snapshot

- **What gets worked on next:** `docs/bets.md` (B1 active, B2 parked). MCP and governance-API hardening and reader forking are parked there.
- **Per-book open work:**
  - `apps/bad-people/TODOS.md`
  - `apps/crumple-zone/TODOS.md`
  - `apps/on-call/TODOS.md`
  - `apps/running-hot/TODOS.md`
- **Cross-cutting open debt IDs:** none.
