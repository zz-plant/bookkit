# engine-change skill

Use this skill for `packages/astro-bookkit/**` changes (schemas, validators, compiler, shared components).

## Guardrails
- No book-specific conditionals in engine.
- Keep validation errors actionable.
- For risky changes (schema/frame/ordering/strictness), include before/after behavior notes.

## Required checklist
1. Confirm no app-specific fork logic in engine code.
2. Run:
   - `bun test`
   - `bun run validate`
   - `bun run check:types`
3. If validation behavior changed, add migration notes in PR body.

## Output expectations
- Include risk level and migration impact explicitly.
