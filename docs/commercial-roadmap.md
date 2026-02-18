# Commercial Roadmap (High-Priority Implementation)

## Goal

Turn Bookkit's existing compiler + governance architecture into a venture-scale product surface without violating layer boundaries.

## Product thesis

Bookkit should be sold as:

- **Compiler infrastructure** for recompilable books/knowledge products
- **Governance infrastructure** for enforceable structure + validation
- **AI interface infrastructure** through MCP resources + deterministic tools

## High-priority tracks

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

- discovery response includes resource types/sections
- discovery response includes safety flags and rate-limit guidance
- tools publish structured metadata (runtime, side effects, idempotency, retry guidance)

Success criteria:

- generic MCP clients can self-configure with minimal hand-tuning
- operators can quickly identify mutating vs read-only capabilities

### Track 3: Governance APIs (next)

Deliverables:

- structured validation outputs aligned with existing CLI errors
- policy/profile presets for stricter release and quality gates
- audit-friendly failure payloads (cause + next action)

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
