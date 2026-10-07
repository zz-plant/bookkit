# AGENTS.md — Architectural Invariants and Guardrails

This file defines non-negotiable rules for human and AI contributors. If guidance conflicts across docs, this file wins for invariants.

---

## Canonical document roles

- `README.md` → orientation + operational commands
- `docs/architecture.md` → system structure: layers, pipelines, engine module map, import tiers
- `CONTRIBUTING.md` → contribution workflow + lanes
- `AGENTS.md` → hard invariants + risk boundaries
- `docs/bets.md` → what gets worked on next and why (anchor, active bets, parked work)
- `CHANGELOG.md` → dated behavior changes and migration notes
- app/package READMEs → local orientation only

Prefer linking over policy duplication.

`docs/architecture.md` is machine-checked by `bun run check:architecture`. If you add, rename, remove, or re-layer an engine module, update that document in the same change — CI fails otherwise.

---

## Core invariant: strict separation of concerns

1. **Author decisions** (`apps/<book>/src/book.config.ts`)
2. **Engine/compiler logic** (`packages/astro-bookkit/**`)
3. **Replaceable content bindings** (`apps/<book>/src/content/book/**`)

### Hard rule

**Never implement book-specific logic inside content files.**

If behavior is needed, either:

- implement engine capability, or
- express it as a frame/config option.

---

## Placement rules

### Structure or requirements changes

✅ put in `packages/astro-bookkit/` (frames, schemas, validators, compiler)

❌ do not implement as book-app conditional rendering

### Book-specific content/config changes

✅ put in `apps/<book>/` (`book.config.ts`, content, routes, layout)

❌ do not fork engine code

### New named concepts

✅ register as mechanisms or glossary terms

❌ do not introduce floating concepts in prose

### Engine module layering

Engine modules are tiered in the module map in `docs/architecture.md`.

✅ import from a strictly lower tier

❌ do not import sideways or upward, and do not introduce a new import cycle

Two cycles are declared and tolerated (`frames` ↔ `validators`, `book` ↔ `components` ↔ `layouts`). Any other cycle fails `bun run check:architecture`. Break it by moving shared code down a tier or inverting the dependency — not by adding an entry to the declared list.

---

## Primary invariants (do not break)

1. **Mechanism identity is stable**
   - slugs are durable identifiers
   - redefinition is a breaking change
2. **Frames are enforceable**
   - required steps must be structurally detectable
   - implied prose is insufficient
3. **Examples are replaceable**
   - changing examples must not change module function
   - current events cannot define mechanisms
4. **Ordering is graph-based**
   - avoid single canonical sequence assumptions
   - encode dependencies and constraints
5. **Action primitives are executable**
   - ≤10 minutes, no heroics, failure-resilient

---

## Validation obligations

When modifying schemas, validators, frames, or compiler behavior:

- ensure validations pass, **or**
- update errors with clear, actionable guidance

Breaking schema/validator changes must include:

- explicit error messaging
- migration notes in `CHANGELOG.md`, the commit message, or the PR body

---

## Risk profile

### Generally safe

- new books
- content additions/edits
- styling updates
- UI atoms

### Risky (extra care required)

- mechanism schema changes
- frame requirement changes
- ordering logic changes
- validation strictness default changes

For risky changes, include:

- rationale in comments and/or PR notes
- short before/after behavior explanation

---

## Failure modes to avoid

- one-off exceptions for a single book
- weakening validation to force pass
- concept sprawl beyond governance capacity
- content drift into abstraction/outrage/therapy while losing executable utility

---

## Agent execution checklist

Before starting work, name the bet in `docs/bets.md` it serves. If it serves none, it is maintenance: keep it small and do not open new audit, PRD, or critique docs for it.

Before finalizing work:

1. confirm files changed in the correct layer
2. run relevant checks (`validate`, lint, typecheck)
3. summarize risks and migration impact for risky changes
4. avoid introducing duplicate policy docs
5. if your work changes the authorship model, update `docs/authorship-model.md`
6. if your work adds, renames, removes, or re-layers an engine module, update `docs/architecture.md` and run `bun run check:architecture`

---

## Ownership map

- Engine: `packages/astro-bookkit/*`
- Book apps: `apps/<book>/*`
