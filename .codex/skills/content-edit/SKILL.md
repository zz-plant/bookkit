---
name: content-edit
description: Use for Lane A/B changes in apps/<book> content and book-app surfaces; enforces replaceable examples, stable mechanism identity, and lane-appropriate checks.
---

# content-edit

## When to use

Use for changes under `apps/<book>/**`, especially:

- `apps/<book>/src/content/book/**`
- `apps/<book>/src/book.config.ts`
- `apps/<book>/src/pages/**`
- `apps/<book>/src/layouts/**`

Do **not** use this skill for engine/schema/compiler changes in `packages/astro-bookkit/**`.

## Allowed file paths

- ✅ `apps/<book>/**`
- ❌ `packages/astro-bookkit/**`

## Risk guidance

- **Low risk (Lane A):** chapter/example/glossary/copy and styling edits.
- **Medium risk (Lane B):** mechanism/toolkit definition and boundary edits.

Escalate to `engine-change` if you need new validation, frame, or compiler behavior.

## Guardrails

- Never implement book-specific runtime behavior inside content files.
- Keep mechanism slug identity stable.
- Keep examples replaceable; examples cannot redefine mechanisms.
- Register new named concepts as mechanisms or glossary terms.

## Required checks

Map checks to `CONTRIBUTING.md` verification matrix:

1. Lane A minimum:
   - `bun run validate`
   - `bun run lint`
2. Lane B minimum:
   - `bun run validate`
   - `bun run lint`
   - `bun run check:types`
3. Lane B escalation (definition/boundary shifts):
   - `bun run validate:release`

## PR note template

- **Lane:** A (low) or B (medium)
- **What changed:**
- **Why:**
- **Boundary check:** confirmed no engine logic added to app/content files
- **Before/after behavior:** (required for Lane B boundary/definition edits)
- **Checks run:** list exact commands and outcomes
- **Migration notes:** only if mechanism meaning changed
