# Bookkit Authorship Model

This document defines the three-pillar model that distinguishes Bookkit from traditional publishing. It is canonical for the "Book as Software" philosophy and how authorship works under that paradigm.

For architecture and commands, see [`README.md`](./README.md). For hard invariants, see [`AGENTS.md`](./AGENTS.md).

---

## Core thesis

Bookkit treats a book as an **executable specification for human and machine action**, not a static pile of chapters. This creates a new authorship model that is structured, governed, and programmable.

---

## Pillar 1 — Authorship as Framing (Structured Intent)

In traditional publishing, an author writes prose and hopes the reader finds the structure. In Bookkit, authorship starts with a **Frame**: a schema of intent that the compiler enforces.

| Traditional model | Bookkit model |
|---|---|
| Author writes chapters | Author declares a frame contract (e.g., *Mechanism* → *Agency* → *Countermove*) |
| Reader discovers structure | Compiler validates required steps are structurally present |
| Editorial judgment | Pedagogical engineering with machine-checkable constraints |

**How it works:**

- `book.config.ts` declares the frame (`frame.slug`, `frame.steps`, `frame.intent`).
- Frame definitions live in `packages/astro-bookkit/src/frames/` and are registered in the engine.
- Content files (MDX with frontmatter) carry structured contracts: `is`/`isNot`, `predictions`, `tests`.
- `packages/astro-bookkit/src/validators/frame.ts` checks that required steps are present, not implied in prose.

The author is not just telling a story. They are building a mental model that the compiler validates.

---

## Pillar 2 — The Recompilable Book (Durable yet Fluid)

A traditional book is "finished" when printed. A Bookkit book is a **living codebase**.

| Layer | Owner | What it holds |
|---|---|---|
| Decisions | Author | `book.config.ts`, content bindings (`src/content/book/**`) |
| Expression | Engine | UI, search index, exports, MCP surface |

**Separation of concerns:**

- The author owns scarce, irreversible decisions: pedagogical strategy, mechanism boundaries, reader objectives.
- The engine owns reusable expression: how the book renders, how it exports, how agents interact with it.

**Recompilation surface:**

- `bun run compile:book -- --book <slug>` rebuilds the book from config + content.
- `bun run export:gitbook -- --book <slug>` generates GitBook-compatible output without touching prose.
- Engine upgrades (new AI QA features, new export formats, MCP tool additions) propagate to all books without content edits.

The book evolves as the technology stack evolves. Prose stays untouched while behavior changes.

**Key invariants:**

- `examplesMustBeSwappable: true` — changing examples must not change mechanism meaning.
- `orderingModel: "constraint-graph"` — sequence is derived from dependencies, not a single canonical order.
- `actionPrimitiveMaxMinutes: 10` — every toolkit action must be executable within 10 minutes.

---

## Pillar 3 — Asymmetric & Personal Authorship

The most radical shift is from "one-to-many" broadcast to **agentic interaction**.

### 3a — Agent-Assisted Authorship (implemented)

Authors do not work alone. They work with agents that validate frames, detect semantic overlaps, and suggest missing toolkit actions.

**Current surface:**

- MCP endpoint: `apps/<book>/src/pages/api/mcp.json.ts`
- Deterministic tools: `bookkit.validate_book`, `bookkit.check_separation`, `bookkit.list_mechanisms`, `bookkit.read_book`, etc.
- Governance resources: agents read `AGENTS.md`, `CONTRIBUTING.md`, README, and local skills before acting.
- Lane skills under `.codex/skills/**` guide content-edit, engine-change, and release workflows.

### 3b — The Reader as Forker (conceptual)

The next frontier is the reader boundary. Instead of a static read-only output, the reader creates a **personal fork** of the book.

**What a fork means:**

- The reader provides organizational data (their own workplace, their own healthcare system, their own jurisdiction).
- They run simulations against the book's mechanism models.
- They record progress, annotate with their own examples, and build a personalized toolkit.

**Required infrastructure (not yet implemented):**

- Runtime for reader-owned data (Durable Objects or D1-backed state).
- Fork API: `POST /api/fork` creates a reader-scoped instance from a book template.
- Artifact model: reader annotations, simulations, and progress stored as versioned artifacts.
- Permission model: reader can read the author's framework, write their own bindings, but cannot mutate the source frame.

**Target platform primitive:** Cloudflare Artifacts (or equivalent durable execution environment) where the author's compiled book is the base image and the reader's fork is a stateful overlay.

---

## Alignment with architecture invariants

Pillar 1 (Framing) enforces the `AGENTS.md` rule: **never implement book-specific logic inside content files**. If behavior is needed, implement it as an engine capability or express it as a frame/config option.

Pillar 2 (Recompilable) enforces strict separation: author decisions in `apps/<book>/`, engine logic in `packages/astro-bookkit/`, content bindings as replaceable data.

Pillar 3 (Agentic) extends the existing MCP surface from author tools to reader runtime. The governance layer (`AGENTS.md`, `CONTRIBUTING.md`, skill definitions) becomes the shared contract between human authors, AI agents, and reader forks.

---

## Document map

| Document | Role |
|---|---|
| `README.md` | Architecture + operational commands |
| `AGENTS.md` | Hard invariants + risk boundaries |
| `CONTRIBUTING.md` | Contribution lanes + verification matrix |
| `docs/authorship-model.md` | This document — the "Book as Software" philosophy |
| `docs/commercial-roadmap.md` | How this model maps to productization |
| `docs/mcp-agent-skills-research.md` | MCP/skill adoption details |
