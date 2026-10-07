# Commercial Roadmap (High-Priority Implementation)

> Sequencing and track status below are superseded by [`docs/bets.md`](./bets.md), which decides what gets worked on next. This document keeps the productization scope for reference.

## Goal

Turn Bookkit's existing compiler + governance architecture into a venture-scale product surface without violating layer boundaries.

## Product thesis

Bookkit should be sold as:

- **Compiler infrastructure** for recompilable books/knowledge products
- **Governance infrastructure** for enforceable structure + validation
- **AI interface infrastructure** through MCP resources + deterministic tools

This maps to the [three-pillar authorship model](./authorship-model.md):

| Pillar | Infrastructure layer | Roadmap track |
|---|---|---|
| 1. Authorship as Framing | Frame registry + validators | Track 3 |
| 2. The Recompilable Book | Compile/export + separation | Track 1, Track 3 |
| 3. Agent-Assisted Authorship | MCP tools + governance resources | Track 2 |
| 3. Reader as Forker | Fork API + artifact model + simulation runtime | Track 4 |

## High-priority tracks

## Current implementation status (consolidated)

- [x] **Track 1: Product surface and positioning** — completed in baseline docs (`README.md` positioning + commercial roadmap linkage).
- [ ] **Track 2: MCP discovery and metadata hardening** — in progress.
- [ ] **Track 3: Governance APIs** — next.
- [ ] **Track 4: Reader Forking** — future. Blocked on Track 3 infrastructure (validation + schema reuse).
- [x] **Track 5: Runbook/SOP wedge** — shipped 2026-09-04 (phase evidence in `CHANGELOG.md`, 2026-09-04 and 2026-09-14 entries).

Use `docs/tech-debt-register.md` as the canonical queue for open remediation tasks tied to these tracks.

### Track 1: Product surface and positioning (now)

Deliverables:

- clear platform positioning in `README.md`
- explicit commercial scope document in `docs/`
- consistent language for managed platform scope + MCP workflows

Success criteria:

- contributors can describe the commercial wedge in one paragraph
- roadmap language maps directly to existing architecture docs

### Track 2: MCP discovery and metadata hardening (now)

Deliverables:

- discovery response includes structured resource categories/types and sections
- discovery response includes safety flags (`read_only`, `mutating`, `requires_guard`) and rate-limit guidance
- discovery response includes recommended query patterns for governance-first and safe mutation workflows
- tools publish structured metadata (runtime, side effects, idempotency, retry guidance)

Success criteria:

- generic MCP clients can self-configure with minimal hand-tuning
- operators can quickly identify mutating vs read-only capabilities

### Track 3: Governance APIs (next)

Deliverables:

- structured validation outputs aligned with existing CLI errors
- policy/profile presets for stricter release and quality gates
- audit-friendly failure payloads (cause + next action)

Track 3 framing now standardizes failure payloads across CLI semantics and MCP responses:

```json
{
  "machineCode": "VALIDATE_BOOK_COMMAND_FAILED",
  "humanSummary": "Validation failed: validate:book exited with code 1.",
  "location": { "module": "scripts/validate-book.ts" },
  "failingRule": "validate:book must complete with zero errors",
  "nextAction": "Fix the reported validation ERRORS, then re-run bun run validate:book -- --book <slug>.",
  "severity": "error",
  "gateLevel": "blocking"
}
```

```json
{
  "machineCode": "CHECK_SEPARATION_COMMAND_FAILED",
  "humanSummary": "Separation checks failed: check:separation exited with code 1.",
  "location": { "module": "scripts/check-separation.ts" },
  "failingRule": "content bindings must remain data-only and pass separation checks",
  "nextAction": "Resolve the reported SEPARATION VIOLATIONS, then re-run bun run check:separation.",
  "severity": "error",
  "gateLevel": "blocking"
}
```

Success criteria:

- teams can integrate validation results into CI and agent workflows
- failed checks are actionable without manual interpretation

### Track 4: Reader Forking (future)

Deliverables:

- fork API creates reader-scoped book instances
- artifact model stores reader annotations, examples, and adaptations
- simulation runtime executes action primitives against reader context
- reader-scoped MCP endpoint exposes fork-level tools and resources
- permission model enforces reader-can-annotate but reader-cannot-mutate-source

Success criteria:

- a reader can create a fork, annotate a mechanism with their own example, and recompile with their overlay
- reader annotations survive source book updates via stable slug binding
- reader can use an agent to suggest next mechanisms based on their progress

Reader forking is parked (`docs/bets.md`). Its gap analysis was retired on 2026-10-07; recover it with `git show 2ca1b3e:docs/reader-forking-gap-analysis.md`.

### Track 5: Runbook/SOP wedge (shipped 2026-09-04)

Before the reader-forking surface, validate the engine as a compiler for verifiable operating procedures (runbooks/SOPs). It needs no identity or persistence, exercises the governed-compiler story, and feeds Track 3 (governance APIs) and Track 4 (fork → site-specific overlay).

Deliverables:

- proof book (`apps/on-call/`) using a new `runbook` frame
- runbook schema extensions (branching steps, ownership, drills, escalation, control mapping)
- derived compliance/audit matrix + drill-coverage verification surface

Shipped; what landed is in `CHANGELOG.md`. The gap analysis was retired on 2026-10-07; recover it with `git show 2ca1b3e:docs/sop-wedge-gap-analysis.md`.

## Sequencing

1. Track 1 + Track 2 in the same milestone (foundation)
2. Track 3 immediately after (enterprise and compliance acceleration)
3. Track 4 after Track 3, reusing governance + validation infrastructure

## Non-goals for this phase

- full multi-tenant billing and account management
- broad workflow automation beyond deterministic tools
- architecture exceptions for one-off book behavior

## Guardrail alignment

This roadmap intentionally preserves Bookkit's invariants:

- keep book-specific behavior in book apps/config
- keep reusable requirements in engine/compiler
- keep content files replaceable and behavior-free
