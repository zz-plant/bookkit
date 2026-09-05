# The Book as Software

A book is a specification that compiles into coherent reader experiences, not a static pile of chapters. This document defines the authorship model that makes that possible.

---

## The problem

Documentation systems render markdown into HTML. They don't answer the questions that matter:

- Does this chapter cover the structural steps it claims to?
- Are these concepts properly bounded, or drifting into vague prose?
- If you swap an example, does the mechanism still mean the same thing?
- If the technology stack changes, does the book break or evolve?

Traditional publishing treats a book as finished when printed. The result is content that rots, structure that decays, and governance that depends on human memory.

---

## Pillar 1 — Authorship as framing

In traditional publishing, an author writes prose and hopes the reader finds the structure. In Bookkit, authorship starts with two kinds of declarations:

### Frames

A **frame** is a shared structural contract — a sequence of steps that every book in a given domain must cover. For example, an intervention book must include Recognition, Exoneration, Mechanism, and Agency. The compiler checks that these steps appear as headings. Not implied in prose. Not buried in paragraphs. Structurally present.

Frames are not table-of-contents templates. They are enforceable schemas. The author declares what must exist; the compiler verifies it does.

### Mechanism contracts

Each named concept in the book — a mechanism — carries its own structural contract:

- **Boundaries** (`is` / `isNot`) — what the mechanism covers and what it explicitly excludes.
- **Predictions** — testable claims about what happens when the mechanism is active.
- **Tests** — questions you can ask to verify the mechanism is real.

These contracts prevent concept drift. A mechanism means the same thing on page 1 and page 200 because the boundaries are declared, not implied.

| Traditional | Bookkit |
|---|---|
| Author writes chapters | Author declares frame steps and mechanism contracts |
| Reader discovers structure | Compiler validates structural presence |
| Concept meaning drifts over time | Mechanism boundaries are machine-checked |

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
- `actionPrimitiveMaxMinutes: 10` — every tool step must be completable in a single focused session.

These are not guidelines. They are compile-time checks.

---

## Pillar 3 — Machine-parseable content

Books are not just read by humans. They are queried, validated, and extended by machines. Bookkit's content is structured enough for AI agents to reason about deterministically:

- Validate structure: "Does this book cover its required frame steps?"
- Check boundaries: "Do these mechanism definitions overlap?"
- Discover content: "What mechanisms does this book define, and what tools are bound to each?"
- Trigger builds: "Compile this book and generate the export artifacts."

This is not a chatbot bolted onto a book. The content carries enough structure that tools can reason about it without hallucinating.

---

## What changes

When you treat a book as software, several things stop being optional:

- **Structure becomes enforceable.** Frame steps are validated at build time, not reviewed by memory.
- **Examples become swappable.** Changing a case study doesn't change the mechanism it illustrates.
- **The stack becomes replaceable.** The same content compiles into web, PDF, EPUB, or API output.
- **Authorship becomes durable.** Decisions are explicit and machine-checkable. They survive tooling changes.

---

## Architecture

```
content (MDX + typed frontmatter) + book configuration
        │
        ▼
  schema validation  (Zod frontmatter schemas)
        │
        ▼
  frame checks       (required structural steps)
        │
        ▼
  graph ordering     (prerequisite-based reading sequences)
        │
        ▼
  compiler outputs   (read UI, APIs, exports, MCP surface)
```

Each layer is independently testable. Validation fails with actionable errors: what failed, where, and how to fix it.
