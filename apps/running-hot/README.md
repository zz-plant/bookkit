# Don't Turn People Into Infrastructure (Book App)

This is a concrete Bookkit book instance.

## What belongs here

- `src/book.config.ts` (book-specific objective function and constraints)
- `src/content/book/**` (replaceable content records)
- `src/pages/**`, `src/layouts/**`, `src/lib/**` (book runtime + presentation)

## What does not belong here

- reusable engine/compiler logic
- schema/frame hacks specific to this one book

If behavior should apply across books, implement it in `packages/astro-bookkit/`.

## Local development

```bash
bun run bookkit dev running-hot
bun run bookkit build running-hot
bun run bookkit validate running-hot
```

## Canonical docs

- Architecture + commands: [`../../README.md`](../../README.md)
- Contribution workflow: [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md)
- Invariants + guardrails: [`../../AGENTS.md`](../../AGENTS.md)
