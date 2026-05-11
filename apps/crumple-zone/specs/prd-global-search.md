# PRD: Global search

## Summary
Provide fast, keyboard-first search across the book with section-aware results, highlighting, and deep links.

## Goals
- Enable readers to find chapters, sections, glossary entries, and mechanisms quickly.
- Support keyboard shortcuts and instant results on desktop.
- Preserve context with highlighted matches and breadcrumb paths.

## Non-goals
- Full-text search across other books or external sites.
- Personalized ranking or ML-based relevance in v1.

## User stories
- As a reader, I can press a keyboard shortcut to open search and type to see results instantly.
- As a reader, I can see which chapter/section a match belongs to before I click.
- As an author, I can trust that all published content is indexed without manual steps.

## Requirements
- Index all published content types (chapters, glossary, mechanisms, toolkit) at build time.
- Provide client-side search UI with keyboard shortcut (e.g., / or Cmd/Ctrl+K).
- Show results grouped by content type and with highlighted match snippets.
- Each result deep-links to the exact section anchor.
- Handle zero-results state with guidance.

## UX notes
- Use an overlay or modal that doesn’t navigate away from the page.
- Highlight matched terms in both title and snippet.
- Preserve previous query when reopening the modal.

## Data & analytics
- Capture search queries (anonymized), result click-through, and zero-result counts.

## Risks & mitigations
- **Risk:** Search index growth impacts bundle size. **Mitigation:** Prebuild index and lazy-load on demand.
- **Risk:** Inconsistent anchors. **Mitigation:** Ensure stable, generated heading IDs.

## Dependencies
- Content indexing pipeline in the build step.
- Stable heading anchors in rendered content.

## Milestones
1. Build index generation (local JSON + section anchors).
2. Implement search modal and keyboard shortcuts.
3. Add grouping, highlighting, and analytics events.
