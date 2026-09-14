# On-Call Runbook — TODOs

Active backlog only. Completed items should move to release notes or changelog artifacts.

Metadata format: `[owner: <role>] [milestone: <target>] [debt: <ID?>]`

## P0 — Backlog hygiene
- _No open P0 backlog hygiene items._

## P1 — Runbook coverage follow-through
- [ ] Add a second release note so `auditReleaseControlDrift` is exercised against real history rather than a single initial draft. `[owner: book maintainers] [milestone: 2026-10 runbook hardening] [debt: ]`

## P2 — Wedge sequencing
- [ ] Resolve the registry namespace/publish decision for `create-bookkit` and `@bookkit/astro-bookkit`; the standalone generator this book demos works vendored, but publishing is still open. `[owner: platform maintainers] [milestone: 2026-10 distribution] [debt: ]`
- [ ] Re-review `docs/sop-wedge-gap-analysis.md`; its next-review trigger (Phase 1 proof book lands) has been met. `[owner: platform maintainers] [milestone: 2026-10 distribution] [debt: ]`
