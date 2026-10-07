# Bookkit local skills

Repository-native lane skills for contributor workflows:

- `content-edit` — Lane A/B content and mechanism/toolkit edits in `apps/<book>/**`
- `engine-change` — Lane C engine/schema/validator/compiler changes in `packages/astro-bookkit/**`
- `release` — release-note/versioning lane and release-readiness checks
- `reader-typography` — typographic taste, the two-voice system, and the review checklist for anything readers see
- `verify` — before any commit: run `bun run verify` and read its summary

`.claude/skills` and `.opencode/skills` are symlinks to this folder, so every agent tool reads the same skills.

Use these as execution checklists, then defer to canonical policy docs:

- `AGENTS.md` for architectural invariants
- `CONTRIBUTING.md` for lane definitions and verification matrix
- `README.md` for command catalog
