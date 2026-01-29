# Bad People (book instance)

This directory hosts the **Bad People** book instance.

Current structure:

- `src/book.config.ts` for the book's core configuration.
- `src/content/book/` for structured content records.
  - `chapters/`
  - `examples/`
  - `glossary/`
  - `mechanisms/`
  - `toolkit/`
- `src/pages/` for Astro routes and layouts.

Keep engine logic in `packages/astro-bookkit/` and reserve this space for book-specific configuration and content only.

## Analytics retention policy

The author analytics dashboard stores anonymized session events locally in the browser:

- Events include page views, time-on-page, and scroll depth only.
- No personal identifiers or user-level profiles are captured.
- Events expire after 90 days to minimize retention.
