# Bad People (Book App)

This is a concrete Bookkit book instance.

## What belongs here

- `src/book.config.ts` (book-specific objective function and constraints)
- `src/content/book/**` (replaceable content records)
- `src/pages/**`, only for a page this book serves differently from every other (a file here replaces the engine's page at the same URL)

## What does not belong here

- reusable engine/compiler logic
- schema/frame hacks specific to this one book

If behavior should apply across books, implement it in `packages/astro-bookkit/`.

## Local development

```bash
bun run bookkit dev bad-people
bun run bookkit build bad-people
bun run bookkit validate bad-people
```

## Local notes

- Analytics dashboard stores anonymized browser-side events only (views/time/scroll).
- No user-level identities are tracked.
- Retention window is 90 days.

## Canonical docs

- Architecture + commands: [`../../README.md`](../../README.md)
- Contribution workflow: [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md)
- Invariants + guardrails: [`../../AGENTS.md`](../../AGENTS.md)
