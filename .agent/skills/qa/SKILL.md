---
name: qa
description: Run the full quality gate. Use before committing any code change.
---

# QA Skill

1. Run Biome lint:

   ```bash
   bun run lint
   ```

2. Run tests:

   ```bash
   bun run test
   ```

3. If any gate fails: fix root cause, re-run. Do NOT chain fix-attempt commits.

## Output

- [ ] `bun run lint` passed
- [ ] `bun run test` passed
