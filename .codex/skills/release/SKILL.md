---
name: release
description: Use for release/versioning updates and release-readiness verification; requires strict validation and upgrade checks before merge.
---

# release

## When to use

Use for release operations and versioned publication changes, such as:

- release notes/content under `apps/<book>/src/content/book/releases/**`
- release metadata/version switching surfaces
- release-oriented scripts or docs

## Allowed file paths

- ✅ `apps/<book>/src/content/book/releases/**`
- ✅ release-related route wiring (`packages/astro-bookkit/src/routes/runtime.ts`, the release-notes and versions pages in `src/routes/pages/`)
- ✅ release docs and ops notes
- ⚠️ If engine release pipeline behavior changes, also run `engine-change` lane checks.

## Risk guidance

- **Medium risk** for release content only.
- **High risk** if touching release validation/engine behavior.

## Guardrails

- Keep release notes factual and auditable.
- Avoid coarse or misleading “updated” language not supported by metadata.
- Preserve reader-safe navigation semantics when route labels change.

## Required checks

Minimum release lane checks:

- `bun run validate` (release rules follow each book's `status`; `validate:release` is an alias)
- `bun run verify -- --all`

Recommended for route/UI release changes:

- `bun run lint`
- `bun run check:types`

## PR note template

- **Lane:** release (medium/high)
- **Release scope:** book(s), version(s), affected routes/artifacts
- **What changed:**
- **Reader impact:**
- **Before/after behavior:** (required if release UX/routes changed)
- **Checks run:** include `validate` and `verify -- --all`
- **Migration/compatibility notes:** redirects, deprecations, or schema implications
