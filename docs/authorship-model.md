# The Book as Software

A book is a specification that compiles into coherent reader experiences, not a static pile of chapters. This document defines the authorship model that makes that possible.

---

## The problem

Documentation systems render markdown into HTML. They don't answer the questions that matter:

- Does this chapter cover the structural steps it claims to?
- Are these concepts properly bounded, or drifting into vague prose?
- Can a reader take a concrete action in under 10 minutes?
- If the technology stack changes, does the book break or evolve?

Traditional publishing treats a book as finished when printed. The result is content that rots, structure that decays, and governance that depends on human memory.

---

## Pillar 1 — Authorship as framing

In traditional publishing, an author writes prose and hopes the reader finds the structure. In Bookkit, authorship starts with a **frame**: a declared sequence of structural steps that the compiler enforces.

| Traditional | Bookkit |
|---|---|
| Author writes chapters | Author declares a frame contract (e.g. Recognition → Mechanism → Agency) |
| Reader discovers structure | Compiler validates required steps are structurally present |
| Editorial judgment | Machine-checkable structural constraints |

A frame is not a table of contents. It's a schema of intent. The author declares what must exist; the compiler checks that it does.

**How it works:**

- `book.config.ts` declares the frame: its slug, steps, and intent.
- Content files (MDX with frontmatter) carry structured contracts: mechanism boundaries (`is`/`isNot`), predictions, tests.
- The frame validator checks that required steps appear as headings — not implied in prose, not buried in paragraphs.

The author is not just telling a story. They are building a mental model that the compiler validates.

---

## Pillar 2 — The recompilable book

A traditional book is frozen at print time. A Bookkit book is a living codebase with strict separation of concerns:

| Layer | Owns | What it holds |
|---|---|---|
| **Author decisions** | Scarce, irreversible choices | Pedagogical strategy, mechanism boundaries, reader objectives |
| **Engine logic** | Reusable expression | Rendering, search, exports, AI integration, MCP surface |
| **Content bindings** | Replaceable data | Chapters, examples, glossary, tools — structured MDX with typed frontmatter |

**The key insight:** author decisions and engine expression are decoupled. Engine upgrades — new export formats, new AI features, new MCP tools — propagate to every book without touching content. Content edits don't break the build.

**Enforceable constraints:**

- `examplesMustBeSwappable` — changing an example must not change the mechanism it illustrates.
- `orderingModel: "constraint-graph"` — reading sequence is derived from prerequisite dependencies, not a single canonical order.
- `actionPrimitiveMaxMinutes: 10` — every tool action must be executable by a depleted reader in under 10 minutes.

These are not guidelines. They are compile-time checks.

---

## Pillar 3 — Agentic authorship

The most radical shift: from one-to-many broadcast to **machine-interpretable structure**.

Books are not just read by humans. They are queried, validated, and extended by AI agents. Bookkit's MCP endpoint exposes deterministic tools:

- `validate_book` — run schema + frame validation
- `check_separation` — verify content stays data-only
- `list_mechanisms` / `read_book` — discover and read structured content
- `compile_book` — trigger a build

Agents read governance files (`AGENTS.md`, `CONTRIBUTING.md`) before acting. The governance layer becomes the shared contract between human authors and AI agents.

This is not a chatbot bolted onto a book. It's a structured interface that agents can reason about deterministically.

---

## What this enables

1. **Governed content** — structure is validated, not assumed. Drift is caught at build time.
2. **Recompilable books** — the same content compiles into different reader experiences (web, PDF, EPUB, API) without modification.
3. **Agent-readable knowledge** — AI tools can validate, extend, and interact with book content through a structured interface.
4. **Durable authorship** — author decisions are explicit and machine-checkable. They survive technology changes.

---

## Architecture

```
content + book.config.ts
        │
        ▼
  schema validation  (Zod frontmatter schemas)
        │
        ▼
  frame checks        (required structural steps)
        │
        ▼
  graph ordering      (prerequisite-based reading sequences)
        │
        ▼
  compiler outputs    (read UI, APIs, exports, MCP surface)
```

Each layer is independently testable. Validation fails with actionable errors: what failed, where, and how to fix it.
