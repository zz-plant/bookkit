# bookkit — Copilot Instructions

## Quick Commands

```bash
bun install && bun run dev   # Start dev server
bun run build                 # Production build
bun run lint                  # Biome check
bun run format                # Biome format
bun run test                  # Vitest
```

## Key Paths

- `apps/` — Application packages
- `packages/` — Shared libraries
- `tests/` — Vitest test suite

## Conventions

- **Package manager:** Bun
- **Linter/Formatter:** Biome
- **Tests:** Vitest
- **Pre-commit:** Husky runs Biome on staged files
- **Commit style:** Conventional Commits

## Pre-Commit Rule

```bash
bun run lint   # Run before pushing.
```
