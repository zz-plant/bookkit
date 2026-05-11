# Gap Analysis: Reader-Forking (Pillar 3)

This document identifies the concrete implementation gap between the current "agent-assisted authorship" surface and the aspirational "reader as forker" model.

For the three-pillar philosophy, see [`docs/authorship-model.md`](./authorship-model.md). For the commercial roadmap, see [`docs/commercial-roadmap.md`](./commercial-roadmap.md).

---

## Current state

### What exists today (author-facing)

| Component | Location | Status |
|---|---|---|
| MCP endpoint | `apps/<book>/src/pages/api/mcp.json.ts` | Production-grade |
| Deterministic tools | `packages/astro-bookkit/src/mcp/tool-definitions.ts` | 10 tools exposed |
| Governance resources | `packages/astro-bookkit/src/mcp/governance.ts` | AGENTS.md, README, skills readable by agents |
| Frame validation | `packages/astro-bookkit/src/validators/frame.ts` | Enforces required steps structurally |
| Compile/export | `packages/astro-bookkit/src/exports/**` | Recompilable surface working |

The author-agent boundary is operational. An agent can read a book's content, validate its frames, check separation, and compile or export it.

### What is missing (reader-facing)

| Component | Required for | Current gap |
|---|---|---|
| Reader identity + auth | Distinguish reader from author | None — no auth layer beyond preview tokens |
| Fork API | Create reader-scoped instance | None — no fork endpoint |
| Durable reader state | Store reader annotations, progress, examples | None — static output only |
| Artifact model | Versioned reader overlay on canonical content | None — no artifact schema |
| Simulation runtime | Execute mechanism models against reader data | None — no execution engine |
| Permission model | Reader writes own data, cannot mutate source | None — no permission system |
| Reader-scoped MCP | Reader's fork exposes its own tools/resources | None — MCP is author-only today |

---

## Gap 1 — Identity and Fork Lifecycle

### Problem

There is no concept of a "reader" in the data model. Preview tokens exist for editorial review, but they do not create persistent identity.

### Required implementation

1. **Reader identity primitive**
   - Option A: Cloudflare Access (OIDC) integration for enterprise readers.
   - Option B: Anonymous fork with durable ID (D1 row + cookie).
2. **Fork API**
   - `POST /api/fork` accepts `bookSlug` and returns `forkId`.
   - Fork copies compiled book metadata (frame, mechanisms, glossary) as read-only base.
   - Fork creates empty reader overlay tables.
3. **Fork data model (D1 schema)**
   ```sql
   CREATE TABLE reader_forks (
     id TEXT PRIMARY KEY,
     book_slug TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE TABLE reader_annotations (
     id TEXT PRIMARY KEY,
     fork_id TEXT NOT NULL,
     content_slug TEXT NOT NULL,
     annotation_type TEXT NOT NULL, -- 'example', 'note', 'simulation'
     payload TEXT NOT NULL, -- JSON
     created_at INTEGER NOT NULL
   );
   CREATE TABLE reader_progress (
     fork_id TEXT PRIMARY KEY,
     completed_slugs TEXT NOT NULL, -- JSON array
     last_accessed INTEGER NOT NULL
   );
   ```

**Estimated effort:** 2–3 days (schema + API + basic UI)

---

## Gap 2 — Artifact Model

### Problem

Reader additions (their own examples, notes, simulation results) have no structured storage or versioning.

### Required implementation

1. **Artifact schema**
   - Each reader annotation is an artifact with:
     - `artifactType`: `example`, `tool_adaptation`, `simulation_result`, `progress_note`
     - `baseSlug`: the canonical mechanism/tool/glossary slug it annotates
     - `payload`: JSON blob (validated against per-type JSON Schema)
     - `version`: integer for optimistic concurrency
2. **Artifact validation**
   - Reuse existing `packages/astro-bookkit/src/validators/**` patterns.
   - Reader artifacts must not violate source frame invariants.
   - Examples: a reader's `example` artifact must match the mechanism's `is`/`isNot` boundaries.
3. **Artifact access in compile**
   - `bun run compile:book` needs a `--fork <forkId>` mode that merges reader artifacts into the build.
   - Reader artifacts overlay canonical content; canonical content is never mutated.

**Estimated effort:** 3–4 days (schema + validation + compile integration)

---

## Gap 3 — Simulation Runtime

### Problem

The book describes mechanisms and action primitives, but there is no runtime for readers to execute them against their own data.

### Required implementation

1. **Action primitive executor**
   - Action primitives are currently prose descriptions with `timeboxMinutes` constraints.
   - A simulation runtime turns these into executable checklists with:
     - State tracking (not started → in progress → completed → reversed)
     - Timer enforcement (≤10 minutes per primitive)
     - Outcome recording (what happened, what was learned)
2. **Simulation API**
   - `POST /api/simulation/run` accepts `mechanismSlug` + reader context.
   - Returns a structured simulation result that the reader can annotate.
3. **Simulation persistence**
   - Stored as `reader_annotations` with `annotation_type = 'simulation'`.
   - Includes input context, steps taken, outcome, and reader reflection.

**Estimated effort:** 5–7 days (executor + API + state machine)

---

## Gap 4 — Reader-Scoped MCP

### Problem

The MCP endpoint is author-centric. A reader's fork should expose its own MCP surface so the reader can use agents to query their own progress, get suggestions based on their annotations, and run simulations.

### Required implementation

1. **Fork MCP endpoint**
   - `apps/<book>/src/pages/api/mcp-fork.json.ts` (or parameterized existing endpoint).
   - Scoped to a specific `forkId`.
   - Exposes reader's own annotations and progress as resources.
2. **Reader MCP tools**
   - `bookkit_fork.list_annotations` — list reader's annotations by section/type.
   - `bookkit_fork.add_annotation` — add an artifact to the fork.
   - `bookkit_fork.run_simulation` — execute a simulation for a mechanism.
   - `bookkit_fork.get_progress` — show completed mechanisms and toolkit actions.
   - `bookkit_fork.suggest_next` — agent suggests next mechanism based on reader's progress + stated context.
3. **Tool safety**
   - Reader tools are scoped to their fork.
   - Reader cannot call author-level tools (`validate_book`, `check_separation`, `create_book`).
   - Reader annotations are validated but cannot mutate canonical content.

**Estimated effort:** 4–5 days (endpoint + tools + scoping)

---

## Gap 5 — Permission Model

### Problem

No explicit permission layer exists for the reader/author boundary.

### Required implementation

1. **Role hierarchy**
   - `author` — owns source frame, can compile, export, mutate canonical content.
   - `reader` — owns fork, can annotate, simulate, merge updates from source.
   - `agent` — operates on behalf of author or reader, bound by role constraints.
2. **Access control matrix**
   | Action | Author | Reader |
   |---|---|---|
   | Mutate canonical MDX | Yes | No |
   | Create fork | Yes (scaffold) | Yes (from published book) |
   | Annotate in fork | No (unless owns fork) | Yes |
   | Run validation on source | Yes | No |
   | Run validation on fork | Yes | Yes |
   | Compile with reader overlay | Yes | Yes (own fork only) |
3. **Implementation**
   - Cloudflare Durable Objects or Workers + D1 for per-fork access control.
   - Or Cloudflare Access for enterprise SSO + custom claims.

**Estimated effort:** 2–3 days (model + middleware + tests)

---

## Sequencing recommendation

| Phase | Deliverable | Effort | Dependencies |
|---|---|---|---|
| 1 | Fork API + D1 schema + basic reader auth | 2–3 days | None |
| 2 | Artifact model + validation + compile overlay | 3–4 days | Phase 1 |
| 3 | Simulation runtime + state machine | 5–7 days | Phase 2 |
| 4 | Reader MCP endpoint + scoped tools | 4–5 days | Phase 2 |
| 5 | Permission model + access control middleware | 2–3 days | Phase 1 |

**Total estimated effort:** 16–22 days (2–3 engineer-weeks)

**Recommended starting point:** Phase 1 + Phase 2 in parallel with Track 3 (Governance APIs) because they share D1 schema and validation infrastructure.

---

## Risk notes

- **Data portability:** Reader forks must be exportable. A reader who invested in annotations should be able to export their fork as a portable artifact bundle.
- **Update propagation:** When the author updates canonical content, reader forks should be able to merge updates without losing annotations. This requires a merge strategy (e.g., annotations bind to stable slugs, not line numbers).
- **Performance:** Per-reader compile with overlay must be fast enough for interactive use. Consider caching compiled base + incremental overlay application.

---

## Document status

- **Created:** 2026-05-11
- **Next review:** When Track 3 (Governance APIs) implementation begins.
- **Owner:** Platform maintainers.
