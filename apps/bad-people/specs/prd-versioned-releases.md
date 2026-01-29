# PRD: Versioned releases

## Summary
Introduce content versioning with a visible version switcher and stable, diff-friendly permalinks.

## Goals
- Allow readers to view current and prior versions of the book.
- Maintain stable URLs per version for citations and references.
- Support author workflows for releasing new versions.

## Non-goals
- Real-time collaborative editing within the product.
- Complex branching/merging in the UI.

## User stories
- As a reader, I can switch between versions to see how guidance changed.
- As an author, I can publish a new version without breaking old links.
- As a reader, I can link to a specific version for citation.

## Requirements
- Version metadata (name, date, optional notes) stored with releases.
- A version switcher visible in the UI on all pages.
- Versioned routing (e.g., `/v/2024-09/...`) with stable permalinks.
- Default/latest version resolves to canonical URLs.
- Archive view listing available versions.

## UX notes
- Version switcher should clearly indicate “Latest” vs historical versions.
- Display version badge near the title or header.

## Data & analytics
- Track version selection events and traffic split by version.

## Risks & mitigations
- **Risk:** Confusing SEO due to duplicate content. **Mitigation:** Canonical tags for latest, noindex for archives if needed.
- **Risk:** Broken references between versions. **Mitigation:** Provide redirect mapping when content slugs change.

## Dependencies
- Content snapshotting during releases.
- Routing support for version prefixes.

## Milestones
1. Add version metadata schema and release pipeline.
2. Implement versioned routing and canonical behavior.
3. Build version switcher and archive list.
