---
name: qa
description: Run the full quality gate. Use before committing any code change.
---

# QA Skill

1. Run Biome lint:

   ```bash
   bun run lint
   ```

2. Run typecheck:

   ```bash
   bun run check:types
   ```

3. Run separation checks:

   ```bash
   bun run check:separation
   ```

4. Run validation:

   ```bash
   bun run validate
   ```

5. Run test suite:

   ```bash
   bun run test
   ```

6. If any gate fails: fix root cause, re-run. Do NOT chain fix-attempt commits.

## Output

- [ ] `bun run lint` passed
- [ ] `bun run check:types` passed
- [ ] `bun run check:separation` passed
- [ ] `bun run validate` passed
- [ ] `bun run test` passed
