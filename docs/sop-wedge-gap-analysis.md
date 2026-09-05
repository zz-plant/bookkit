# Gap Analysis: Runbooks / SOPs as a Wedge (Pillar 2)

This document pressure-tests "recompilable runbooks and standard operating procedures" as the next build wedge and sequences the implementation.

For the three-pillar philosophy, see [`docs/authorship-model.md`](./authorship-model.md). For the commercial roadmap, see [`docs/commercial-roadmap.md`](./commercial-roadmap.md). Sibling analysis: [`docs/reader-forking-gap-analysis.md`](./reader-forking-gap-analysis.md).

---

## Thesis

Every operations, security, and compliance team maintains runbooks and SOPs. Those documents rot, get contradicted by later edits, and get audited ("show us the procedure, show us the change history, prove it covers this control"). Bookkit already encodes everything a governed runbook needs — structured primitives with triggers and timeboxes, enforceable frames, graph-ordered procedures, versioned releases, and deterministic validation — except the runbook-specific fields.

The wedge: **sell the engine as a compiler for verifiable operating procedures** before building the heavier reader-forking surface. It needs no identity, auth, or persistence; it is schema + frame + validator + one proof book. It also feeds Track 3 (governance APIs) and Track 4 (fork → site-specific overlay).

---

## Current state

### What exists today and maps directly

| Component | Location | Fit for runbooks |
|---|---|---|
| Toolkit primitive (trigger, timeboxMinutes ≤10, steps, failureLooksLike, legitimateDemand) | `packages/astro-bookkit/src/schemas/toolkit.ts` | A runbook step primitive with entry conditions and failure semantics |
| Mechanism contract (is/isNot/predictions/tests) | `packages/astro-bookkit/src/schemas/mechanism.ts` | An engineered control with verification questions |
| Field-guide frame (steps, failure-modes, checklist) | `packages/astro-bookkit/src/frames/defaults.ts` | Closest frame; missing runbook-specific steps |
| Prerequisite graph + reading pathways | `packages/astro-bookkit/src/book/graph.ts` | Procedure sequencing derived from dependencies |
| Releases/versions + release notes | `packages/astro-bookkit/src/releases/**` | SOP change history + "why did this step change" |
| Validation surface (`validate`, `check:separation`) | `scripts/`, `packages/astro-bookkit/src/validators/**` | Enforceable SOP invariants in CI |
| `check:suggestions` AI layer | `packages/astro-bookkit/src/suggestions/**` | Natural home for runbook-quality analyzers |

### What is missing for runbooks

| Gap | Current | Required for runbooks |
|---|---|---|
| Branching/conditional steps | `steps: string[]` is linear prose | `when <condition> → do <step>` decision forks |
| Ownership and approval | not present anywhere | owner/approver + review cadence on primitives |
| Control/compliance mapping | no field | `satisfies` on mechanisms/tools → compliance matrix |
| Drill/verification per procedure | mechanisms have `tests`, tools do not | how you prove the procedure works (drill checklist) |
| Escalation path | encoded only in prose (`failureLooksLike`) | machine-detectable who/when/SLA to escalate |
| Runbook frame | field-guide | enforceable trigger/steps/escalation/verification frame |

---

## Gap 1 — Runbook schema extensions

### Problem

The toolkit primitive is a teaching action, not an operating step. Runbooks need conditional branches, an owner, a drill, and an escalation target.

### Required implementation

1. **Branching on steps** — allow each step to carry an optional `when` precondition:
   ```ts
   type RunbookStep = { when?: string; action: string };
   ```
   Backward-compatible: keep `steps: string[]` and add optional `runbookSteps: RunbookStep[]`, or make schema accept both.
2. **Ownership** — optional `owner` + `reviewEveryDays` on primitives and chapters. Optional so existing books are unaffected.
3. **Verification** — optional `drills: string[]` on tools: concrete exercises that prove the procedure works. Mirrors mechanism `tests`.
4. **Escalation** — optional `escalation: { to: string; when: string; withinHours: number }`.
5. **Control mapping** — optional `satisfies: string[]` on mechanisms and tools, pointing at control IDs.

**Estimate:** 1–2 days (schema + migrations + error messaging). Per AGENTS.md, schema changes need explicit error messages and migration notes in README/commit.

---

## Gap 2 — Runbook frame

### Problem

"Steps / Failure Modes / Checklist" does not force a runbook to declare who owns it, when to run it, when to escalate, and how to verify it.

### Required implementation

1. Register a new default frame `runbook` with required steps:
   - `ownership` — who owns the procedure and its scope
   - `trigger` — entry conditions
   - `steps` — the procedure
   - `escalation` — when to hand off
   - `verification` — how you know it worked (drill)
2. Keep `field-guide` untouched for teaching books. Frames are per-book config; a runbook book selects the `runbook` frame in `book.config.ts`.

**Estimate:** 1 day (frame registry + frame validator already generic).

---

## Gap 3 — Compliance/audit view

### Problem

A governed runbook must answer "which procedures satisfy which controls, and which changed when." Nothing derives this today.

### Required implementation

1. **Derived compliance matrix** — compile-time mapping from `satisfies` to owning procedures, using the prerequisite graph (a control is satisfied by the mechanism and its bound tools).
2. **Structured audit payload** — reuse the Track 3 failure-payload pattern to emit `{ control, satisfiedBy, state, lastChanged, nextReview }` as JSON, so CI or audit tooling can consume it.
3. **Release diff enrichment** — release notes gain runbook-relevant entries: step changed, approver, control affected.

**Estimate:** 2 days (derivation + payload + release-notes hook).

---

## Gap 4 — Runbook verification surface

### Problem

Nothing forces a procedure to actually be exercised, and no tool surfaces coverage.

### Required implementation

1. **Drill coverage check** — extend the validation set with `check:runbooks` (or fold into `check:suggestions`): every tool without a drill, every mechanism in the `runbook` frame book without a `satisfies` mapping, every escalation without a target.
2. **Verification MCP tool** — `bookkit.verify_runbook_coverage` returns which procedures are drilled/covered/owned, reusing the suggestions/validators pattern.
3. **Reuse of `check:suggestions` analyzers** — new analyzer category `runbook-coverage` under `packages/astro-bookkit/src/suggestions/**` so the AI layer flags gaps alongside the existing overlap/concept/example checks.

**Estimate:** 2–3 days (analyzers + MCP tool + tests).

---

## Gap 5 — Proof book

### Problem

The wedge is not believable until a real runbook compiles through the engine.

### Required implementation

1. Add `apps/on-call/` (or `apps/incident-response/`): a realistic on-call runbook using the `runbook` frame, one mechanism per control, tools as steps, a drill section, and one release note.
2. Surface its compliance matrix on the read hub ("Coverage" section) so the output is demo-able.
3. Let existing books stay teaching-shaped; prove the frame is per-book configuration, not a fork of the engine.

**Estimate:** 2 days (content + route wiring).

---

## Sequencing recommendation

| Phase | Deliverable | Effort | Dependencies |
|---|---|---|---|
| 1 | Proof book (`apps/on-call/`) with `runbook` frame + existing schemas | 2 days | None |
| 2 | Schema extensions (branching, owner, drills, escalation, satisfies) + migration notes | 1–2 days | Phase 1 exposes the gaps |
| 3 | `runbook` frame registration + validators | 1 day | Phase 2 (uses new fields) |
| 4 | Compliance/audit view (derived matrix in CLI) + release-diff enrichment | 2 days | Phase 2 |
| 5 | Drill-coverage analyzers + `check:suggestions` integration | 2–3 days | Phase 2, reuses `src/suggestions` |

**Total estimated effort:** 8–10 days (2 engineer-weeks), roughly half the reader-forking surface and with zero auth/persistence risk.

**Recommended starting point:** Phase 1 immediately — it is content-only and proves the wedge without touching schemas. Phase 2 then layers fields on top of a real book instead of inventing them abstractly.

**Implementation status (2026-09-04):**

- ✅ **Phase 1** — `apps/on-call/` landed with the `runbook` frame, 4 control mechanisms (`satisfies` per control), 4 toolkit primitives bearing `owner`/`drills`/`escalation`/`runbookSteps`, examples, glossary, and a release note. `validate-book --book on-call` is clean.
- ✅ **Phase 2** — `toolkitSchema` extended with `owner`, `reviewEveryDays`, `drills`, `escalation`, `satisfies`, `runbookSteps` (branching `{when?, action}`); `mechanismSchema` gains `satisfies`. All optional with defaults; existing books stay green.
- ✅ **Phase 3** — `runbook` frame registered (ownership/trigger/steps/escalation/verification, all required). `book-validator` and `validate-book` now validate the overview header against the frame declared in `book.config.ts` (via `extractFrameConfigFromSource`, fallback intervention), so runbook books are checked structurally instead of against the intervention frame.
- ✅ **Phase 4** — `deriveComplianceMatrix` + `summarizeCompliance` feed CLI compliance matrices (both `check:suggestions` and `check:runbooks`); `auditReleaseControlDrift` joins release narratives against HEAD coverage (release-diff enrichment).
- ✅ **Phase 5** — `auditRunbookCoverage` runs inside `check:suggestions` for runbook-frame books; a dedicated `scripts/check-runbooks.ts` (`bun run check:runbooks`, `--mode error` supported) audits coverage and prints the matrix. The MCP `bookkit.validate_book` tool already existed and runs `validateBookInMemory` for deterministic verification.
- ⏳ **Open** — external `create-bookkit` npm package (needs a namespace/publish decision), and treating the compliance matrix as an exportable artifact (PDF/JSON).

---

## Why this before the reader-forking track

- Reader-forking requires identity, durable state, and an overlay compiler — a bigger surface with real infra risk.
- The runbook wedge is content + schema + validator work that slots into the existing governed-compiler story and produces a demo-able product with no new infrastructure.
- It is Track-3-shaped: audit-friendly, structured payloads, deterministic tools. Forking then becomes "a site-specific runbook overlay," which reuses the same artifact model later.

---

## Risk notes

- **Schema drift:** keep new fields optional with defaults so the three existing books stay green; add migration notes to the README and explicit error messages per AGENTS.md.
- **Frame proliferation:** one `runbook` frame, not a per-customer frame. If a runbook book needs new required steps, extend the frame registry in the engine, never the book.
- **Compliance theater:** `satisfies` is machine-checkable but not evidence. The drill (`drills`) is the evidence; treat the matrix as coverage, not certification.
- **Feature-flag style:** the wedge must not make teaching books runbook-shaped. The frame and fields are opt-in per book.

---

## Document status

- **Created:** 2026-09-04
- **Next review:** when Phase 1 proof book lands.
- **Owner:** Platform maintainers.