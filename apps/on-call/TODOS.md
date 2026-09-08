# On-Call Runbook — TODOs

Active backlog only. Completed items should move to release notes or changelog artifacts.

Metadata format: `[owner: <role>] [milestone: <target>] [debt: <ID?>]`

## P0 — Backlog hygiene
- _No open P0 backlog hygiene items._

## P1 — Runbook coverage follow-through
- [ ] Surface review cadence: every toolkit primitive declares `reviewEveryDays` (14–30), but nothing computes a due date or flags an overdue procedure. Extend `check:runbooks` to compare the declared cadence against the latest release date. `[owner: platform maintainers] [milestone: 2026-10 runbook hardening] [debt: TD-008]`
- [ ] Add a second release note so `auditReleaseControlDrift` is exercised against real history rather than a single initial draft. `[owner: book maintainers] [milestone: 2026-10 runbook hardening] [debt: ]`

## P2 — Wedge sequencing
- [ ] Resolve the registry namespace/publish decision for `create-bookkit` and `@bookkit/astro-bookkit`; the standalone generator this book demos works vendored, but publishing is still open. `[owner: platform maintainers] [milestone: 2026-10 distribution] [debt: ]`
- [ ] Re-review `docs/sop-wedge-gap-analysis.md`; its next-review trigger (Phase 1 proof book lands) has been met. `[owner: platform maintainers] [milestone: 2026-10 distribution] [debt: ]`
