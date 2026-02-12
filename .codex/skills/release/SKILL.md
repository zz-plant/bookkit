# release skill

Use this skill for release-note, version, and integration updates.

## Guardrails
- Release notes should be factual, section-scoped, and auditable.
- Do not use vague "updated" labels without metadata backing.

## Required checklist
1. Ensure release frontmatter has `version`, `date`, `summary`.
2. If section-level updates are used, include `changedSections`.
3. Run:
   - `bun run validate:release`
   - `bun run validate`

## Output expectations
- Summarize release impact by section.
- Note any webhook/RSS behavior changes.
