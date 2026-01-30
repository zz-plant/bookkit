# PRD: Reader feedback widgets

- [x] Implemented in bookkit feedback widget, endpoint, and dashboard components.

## Summary
Add lightweight feedback prompts so readers can react to chapters and sections.

## Goals
- Capture quick sentiment on content usefulness.
- Provide optional comments without disrupting reading flow.
- Enable authors to review feedback in aggregate.

## Non-goals
- Public discussion forums or threaded conversations.
- Moderation tools beyond basic filtering in v1.

## User stories
- As a reader, I can click “Was this helpful?” and optionally leave a short comment.
- As a reader, I can react with a quick emoji without logging in.
- As an author, I can view feedback trends by chapter.

## Requirements
- Inline feedback widget at the end of chapters (and optionally key sections).
- Responses include helpful/not helpful and optional comment.
- Anti-spam measures (rate limits, minimal friction).
- Author dashboard to view aggregate stats and recent comments.

## UX notes
- Keep the widget small and unobtrusive.
- Provide confirmation after submission.

## Data & analytics
- Store feedback by content slug, timestamp, and response type.
- Track conversion rate from view to feedback.

## Risks & mitigations
- **Risk:** Spam or abuse. **Mitigation:** Rate limit and basic filtering.
- **Risk:** Low response rate. **Mitigation:** A/B test placement and wording.

## Dependencies
- Analytics/feedback storage layer.
- Author-facing dashboard view.

## Milestones
1. Add feedback schema + storage endpoint.
2. Build UI widget and submission flow.
3. Create author feedback dashboard.
