# AGENTS.md — Architectural Invariants and Guardrails

This file defines non-negotiable rules for human and AI contributors. If guidance conflicts across docs, this file wins for invariants.

---

## Canonical document roles

- `README.md` → architecture + operational commands
- `CONTRIBUTING.md` → contribution workflow + lanes
- `AGENTS.md` → hard invariants + risk boundaries
- app/package READMEs → local orientation only

Prefer linking over policy duplication.

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
- migration notes in README, commit message, or PR body

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

Before finalizing work:

1. confirm files changed in the correct layer
2. run relevant checks (`validate`, lint, typecheck)
3. summarize risks and migration impact for risky changes
4. avoid introducing duplicate policy docs

---

## Ownership map

- Engine: `packages/astro-bookkit/*`
- Book apps: `apps/<book>/*`
