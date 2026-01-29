# AGENTS.md — Architectural Invariants (Humans + AI)

This file defines the **non-negotiable rules** that keep the system recompilable, coherent, and governable over time.

These rules apply to humans and automated agents equally.

---

## Core invariant

This repo enforces a strict separation of concerns:

1. **Author decisions (scarce, irreversible)**
   `apps/<book>/src/book.config.ts`
2. **Engine / compiler logic (reusable)**
   `packages/astro-bookkit/**`
3. **Bindings (replaceable content)**
   `apps/<book>/src/content/book/**`

### Hard rule

**Never implement book-specific logic inside content files.**

If behavior is needed:

- add it to the engine, or
- make it a frame option.

Do not hack around the architecture.

---

## What belongs where

### Change structure or requirements

✅ `packages/astro-bookkit/`

- frames
- schemas
- validators
- compiler logic

❌ Not inside a book app as conditional rendering.

### Add or modify a book

✅ `apps/<book>/`

- `book.config.ts`
- content records
- routes and layout

❌ Do not fork the engine.

### Add new concepts

✅ Register them as **mechanisms** or **glossary terms**

❌ Do not introduce floating named concepts in prose.

---

## Primary invariants (do not break)

### 1) Mechanism identity is stable

- Slugs are stable identifiers.
- A mechanism must always mean the same thing.
- Redefinitions are breaking changes.

### 2) Frames are enforceable

- Required steps must be structurally detectable.
- “It’s implied in prose” is not sufficient.

### 3) Examples are replaceable

- Swapping examples must not change the module’s function.
- Current events must never define a mechanism.

### 4) Ordering is a graph

- No single canonical outline.
- Use dependencies and constraints instead.

### 5) Action primitives are executable

- ≤10 minutes
- no heroics
- works even if it fails

If a tool requires courage, expertise, or perfect compliance, it is invalid.

---

## Validation expectations

When modifying:

- schemas
- validation rules
- compiler logic
- frame requirements

You must ensure:

- validations still pass, or
- validation errors are updated with actionable guidance

Breaking schema changes require:

- clear error messages
- migration notes (README or commit message)

---

## Risk profile

### Generally safe

- adding new books
- adding content
- styling changes
- new UI atoms

### Risky (requires care)

- changing mechanism schemas
- altering frame requirements
- modifying ordering logic
- changing validation strictness defaults

For risky changes, include:

- a short rationale in code comments
- a before/after explanation in the commit or PR

---

## Failure modes to avoid

- letting chapters drift into therapy, outrage, or abstraction
- introducing one-off exceptions for a single book
- weakening validation “just to make it pass”
- expanding mechanism sets beyond what can be governed

---

## Ownership (optional)

- Engine: `packages/astro-bookkit/*`
- Books: `apps/<book>/*`
