---
name: content-edit
description: Use for Lane A/B changes in apps/<book> content and book-app surfaces; enforces replaceable examples, stable mechanism identity, and lane-appropriate checks.
---

# content-edit

## When to use

Use for changes under `apps/<book>/**`, especially:

- `apps/<book>/src/content/book/**`
- `apps/<book>/src/book.config.ts`
- `apps/<book>/src/pages/**` (a page here replaces the engine's page at the same URL)
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

## Drafting a file that compiles

The compiler decides whether content is valid; a draft is a proposal until it passes.

1. Read the contract first: `bun run bookkit contract <section>` (mechanism, tool, example, chapter, glossary), or the MCP tool `bookkit.get_content_contract`. It lists each field, whether its absence is an error or a warning, what to write in it, and a file that compiles.
2. Check the file before moving on: `bun run bookkit check <file.mdx> [--json]` after writing it, or `bookkit.check_content` with the full source before writing (`bookkit.write_content` checks it and writes it in one call). Every finding has a `code`, the `field`, and a `fix`; apply the fixes and check again until it reports no errors.
3. A reference to an unknown mechanism is an error. When the slug was merged away, the fix names its replacement (from `corpus.json`); otherwise it names the closest existing slugs. Bind one of those, or run `bookkit similar` before coining a new mechanism.
4. Fields such as a tool's `trigger` and `steps`, or a mechanism's `definition`, are the author's argument. Draft them only when the author asks, keep `status: draft`, and say which fields you wrote.

## Required checks

1. `bun run verify` (see the `verify` skill). For a content edit it validates and builds the book you touched, checks separation, and, when a mechanism changed, compares mechanisms across books.
2. Lane B escalation (definition/boundary shifts): `bun run check:corpus`. Release rules already follow the book's `status`, so `validate:release` (an alias of `validate`) adds nothing.

## PR note template

- **Lane:** A (low) or B (medium)
- **What changed:**
- **Why:**
- **Boundary check:** confirmed no engine logic added to app/content files
- **Before/after behavior:** (required for Lane B boundary/definition edits)
- **Checks run:** list exact commands and outcomes
- **Migration notes:** only if mechanism meaning changed
