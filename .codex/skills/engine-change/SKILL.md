---
name: engine-change
description: Use for Lane C changes in packages/astro-bookkit (frames, schemas, validators, compiler, shared components) with actionable errors and migration impact notes.
---

# engine-change

## When to use

Use for changes in engine internals, including:

- `packages/astro-bookkit/src/frames/**`
- `packages/astro-bookkit/src/schemas/**`
- `packages/astro-bookkit/src/validators/**`
- `packages/astro-bookkit/src/compiler/**`
- `packages/astro-bookkit/src/mcp/**`

## Allowed file paths

- ✅ `packages/astro-bookkit/**`
- ✅ tests/specs/docs supporting engine behavior updates
- ❌ book-specific app exceptions for one title

## Risk guidance

This lane is **high risk** by default.

Extra-care areas:

- mechanism schema changes
- frame requirement changes
- ordering logic changes
- validation strictness default changes

## Guardrails

- Keep engine behavior book-agnostic.
- Keep validation errors explicit and actionable.
- Do not weaken validation to force pass.
- For behavior-affecting changes, include short before/after notes and migration impact.

## Required checks

Lane C baseline from `CONTRIBUTING.md`:

- `bun run validate`
- `bun run validate:release`
- `bun run lint`
- `bun run check:types`

Escalation for behavior-affecting changes:

- `bun run check:upgrade -- --release`

## PR note template

- **Lane:** C (high)
- **Risk rationale:**
- **What changed:**
- **Before/after behavior:**
- **Validation UX impact:** updated error messages and remediation text
- **Checks run:**
- **Migration notes:** required for schema/validator/frame contract changes
