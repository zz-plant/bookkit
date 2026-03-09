# Commercial Roadmap (High-Priority Implementation)

## Goal

Turn Bookkit's existing compiler + governance architecture into a venture-scale product surface without violating layer boundaries.

## Product thesis

Bookkit should be sold as:

- **Compiler infrastructure** for recompilable books/knowledge products
- **Governance infrastructure** for enforceable structure + validation
- **AI interface infrastructure** through MCP resources + deterministic tools

## High-priority tracks

## Current implementation status (consolidated)

- [x] **Track 1: Product surface and positioning** — completed in baseline docs (`README.md` positioning + commercial roadmap linkage).
- [ ] **Track 2: MCP discovery and metadata hardening** — in progress.
- [ ] **Track 3: Governance APIs** — next.

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

## Sequencing

1. Track 1 + Track 2 in the same milestone (foundation)
2. Track 3 immediately after (enterprise and compliance acceleration)

## Non-goals for this phase

- full multi-tenant billing and account management
- broad workflow automation beyond deterministic tools
- architecture exceptions for one-off book behavior

## Guardrail alignment

This roadmap intentionally preserves Bookkit's invariants:

- keep book-specific behavior in book apps/config
- keep reusable requirements in engine/compiler
- keep content files replaceable and behavior-free
