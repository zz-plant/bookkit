# PRD: Export formats (PDF/EPUB)

## Status
- [x] Implemented

## Summary
Provide high-quality PDF and EPUB exports with styled covers and per-chapter downloads.

## Goals
- Enable offline reading and printing.
- Offer per-chapter and full-book exports.
- Maintain branded styling and readable typography.

## Non-goals
- Kindle-specific (.mobi) export in v1.
- On-demand printing integration.

## User stories
- As a reader, I can download the full book as a PDF or EPUB.
- As a reader, I can download a single chapter for offline use.
- As an author, I can ensure exported content matches the site’s structure.

## Requirements
- Export pipeline generating PDF and EPUB from the same content source.
- Styled cover page including title, version, and date.
- Per-chapter download links and full-book download option.
- Ensure links and references resolve correctly in exports.

## UX notes
- Provide download buttons near the table of contents.
- Indicate file size and last updated date.

## Data & analytics
- Track download counts by format and chapter.

## Risks & mitigations
- **Risk:** Formatting issues in EPUB. **Mitigation:** Automated validation and sample device checks.
- **Risk:** Export time slow. **Mitigation:** Generate on release or cache outputs.

## Dependencies
- Reliable rendering pipeline (e.g., MD → HTML → PDF/EPUB).
- Build step for generating export artifacts.

## Milestones
1. Implement export pipeline and styling.
2. Add per-chapter and full-book download links.
3. Add analytics tracking for downloads.
