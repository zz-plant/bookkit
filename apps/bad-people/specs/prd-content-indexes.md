# PRD: Content index views

## Summary
Provide index pages for each content collection (chapters, mechanisms, toolkit, glossary, examples)
with scannable lists and deep links to individual entries.

## Goals
- Give readers a structured way to browse each content type.
- Ensure each content entry is discoverable without search.
- Keep lists consistent and easy to scan.

## Non-goals
- Full-text search (handled separately).
- Editorial ranking or personalization.
- Replacing the reading hub or overview page.

## User stories
- As a reader, I can browse all chapters from a single index page.
- As a reader, I can skim definitions in the mechanisms or glossary list before opening a full entry.
- As an author, I can verify that every content record renders in a list without errors.

## Requirements
- Index pages for each collection: chapters, mechanisms, toolkit, glossary, examples.
- Lists are sorted deterministically (title or slug) for stable navigation.
- Each list item includes a title and a short descriptor (summary/definition) when available.
- Each list item links to the detail page for the entry.
- Back-link from each index page to the reading hub.

## UX notes
- Use a simple stacked list with clear hierarchy.
- Keep metadata short to avoid clutter.

## Risks & mitigations
- **Risk:** Missing metadata for entries. **Mitigation:** Fall back to safe defaults and flag missing fields during validation.
- **Risk:** List size becomes unwieldy. **Mitigation:** Add optional grouping or filtering in a later iteration.

## Dependencies
- Content collection frontmatter fields (title, summary/definition).
- Detail routes for each content type.

## Milestones
1. Implement list rendering for each content type.
2. Add sorting and metadata fallbacks.
3. Add back-links and shared layout.
