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
- ✅ release-related app/lib wiring (`src/lib/release-notes.ts`, `src/lib/versions.ts`)
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

- `bun run validate`
- `bun run validate:release`
- `bun run check:upgrade -- --release`

Recommended for route/UI release changes:

- `bun run lint`
- `bun run check:types`

## PR note template

- **Lane:** release (medium/high)
- **Release scope:** book(s), version(s), affected routes/artifacts
- **What changed:**
- **Reader impact:**
- **Before/after behavior:** (required if release UX/routes changed)
- **Checks run:** include `validate:release` and `check:upgrade -- --release`
- **Migration/compatibility notes:** redirects, deprecations, or schema implications
