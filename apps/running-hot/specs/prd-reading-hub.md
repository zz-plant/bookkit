# PRD: Reading hub + overview

## Summary
Provide a single entry point for navigating the book’s content collections, plus a lightweight overview
that surfaces the book’s objectives, frame, constraints, and core mechanisms.

## Goals
- Give readers and authors a fast way to jump between content areas (chapters, mechanisms, toolkit, glossary, examples).
- Provide a concise overview page that communicates the book’s intent and structure.
- Keep the navigation experience simple and consistent with the book’s information architecture.

## Non-goals
- Full site navigation redesign.
- Advanced personalization or recommendation logic.
- Replacing the public-facing landing page.

## User stories
- As a reader, I can open a reading hub and quickly choose the section I want.
- As an author, I can reference a single overview page that summarizes the book’s objectives and constraints.
- As a reviewer, I can quickly verify which mechanisms the book depends on.

## Requirements
- Reading hub page that links to each content collection and indicates item counts.
- Overview page that shows objectives, frame steps, causal stance, constraints, and core mechanisms.
- Back-link from the overview to the hub.
- Clear, consistent titles and descriptions for each hub card.

## UX notes
- Use card-based navigation with short descriptions.
- Keep the overview as a readable summary, not a marketing page.

## Risks & mitigations
- **Risk:** Hub becomes a second homepage. **Mitigation:** Position it as a reading tool, not a public landing page.
- **Risk:** Overview content drifts from source of truth. **Mitigation:** Pull content directly from book configuration.

## Dependencies
- Book configuration values (objectives, frame, constraints, mechanisms).
- Content collections with stable file naming.

## Milestones
1. Implement hub layout and cards for each collection.
2. Add overview page wired to book configuration data.
3. Add back-links and metadata counts.
