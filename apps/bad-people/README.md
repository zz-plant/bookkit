# Bad People (book instance)

This directory hosts the **Bad People** book instance.

## Scope

Use this app for:

- `src/book.config.ts` (book-level objectives, constraints, and mechanisms)
- `src/content/book/**` (replaceable content bindings)
- `src/pages/**` and `src/layouts/**` (book routes and presentation)

Do **not** place reusable engine/compiler logic in this directory.

## Canonical docs

For contributor guidance, use these canonical docs instead of duplicating policy here:

- Repo architecture + commands: [`README.md`](../../README.md)
- Contribution workflow and lanes: [`CONTRIBUTING.md`](../../CONTRIBUTING.md)
- Non-negotiable invariants (humans + AI): [`AGENTS.md`](../../AGENTS.md)

## Analytics retention policy

The author analytics dashboard stores anonymized session events locally in the browser:

- Events include page views, time-on-page, and scroll depth only.
- No personal identifiers or user-level profiles are captured.
- Events expire after 90 days to minimize retention.
