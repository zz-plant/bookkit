# PRD: Analytics dashboard

## Summary
Provide chapter-level engagement analytics with drop-off insights for authors.

## Goals
- Show view counts and reading progression per chapter.
- Identify drop-off points to improve content structure.
- Provide a simple, privacy-conscious analytics view.

## Non-goals
- User-level tracking or identity resolution.
- Advanced cohort segmentation in v1.

## User stories
- As an author, I can see which chapters are most viewed.
- As an author, I can identify where readers drop off.
- As an author, I can compare engagement across versions.

## Requirements
- Capture page views with anonymized session IDs.
- Estimate scroll depth or section engagement.
- Dashboard view with charts for views, time-on-page, and drop-off.
- Ability to filter by version and date range.

## UX notes
- Present a simple overview card layout.
- Use sparklines for quick trend visibility.

## Data & analytics
- Store events with minimal PII.
- Provide data retention policy documentation.

## Risks & mitigations
- **Risk:** Privacy concerns. **Mitigation:** Anonymize data and document what is collected.
- **Risk:** Inaccurate drop-off detection. **Mitigation:** Use coarse metrics and explain limitations.

## Dependencies
- Event ingestion pipeline.
- Author-only dashboard route.

## Milestones
1. Implement event collection and storage.
2. Build dashboard UI with core metrics.
3. Add filters for version and date.
