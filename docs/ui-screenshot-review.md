# UI Screenshot Review (Bad People app)

Date: 2026-02-16
Reviewer: Codex agent

## Scope

Screens reviewed from local dev server (`bun run dev:bad-people`):

- Home (`/`)
- Reading hub (`/read`)
- Release notes (`/release-notes`)
- Offline downloads (`/downloads`)
- New book generator (`/new-book`)
- Version archive (`/versions`)

## What works well

1. Strong information hierarchy
   - Headline typography and card grouping make major actions legible.
2. Consistent visual language
   - Border radius, spacing, and muted panel surfaces feel coherent.
3. Clear routing model
   - “Start here / Solve now / Reference” framing is understandable for first-time readers.

## Constructive critique

1. Improve contrast and readability for long-form support copy
   - Secondary paragraph text is too light against the background in several sections.
   - Suggestion: increase body text contrast and/or font size by one step for helper copy.

2. Increase primary CTA prominence on dense pages
   - On `/read` and `/new-book`, many cards/actions compete visually.
   - Suggestion: reserve one dominant button style per section and downgrade secondary actions to text links.

3. Add stronger in-page wayfinding for long pages
   - `/new-book` is very long and can feel like a form wall.
   - Suggestion: add sticky mini-TOC or progress steps (e.g., 1/3, 2/3, 3/3).

4. Tighten vertical rhythm between major sections
   - Some section transitions feel visually similar and can blur boundaries.
   - Suggestion: slightly increase spacing or add subtle section dividers.

5. Clarify link affordances in utility-heavy views
   - On `/downloads`, chapter export rows look text-like and less interactive.
   - Suggestion: style links as explicit controls (icon + hover/focus state + underlines).

6. Surface status and recency cues more explicitly
   - Release/version pages are clean but “what changed for me” cues can be stronger.
   - Suggestion: add compact chips such as “Updated since last visit” and “Impact: reader/author”.

## Accessibility quick wins

- Ensure visible keyboard focus rings on all interactive cards/links.
- Verify minimum contrast for muted text and subtle borders.
- Add “Skip to content” link if not already present.

## Follow-up recommendation

Run a lightweight usability pass with 3 tasks:

1. “Find where to start reading.”
2. “Download one chapter for offline reading.”
3. “Find what changed since the last release.”

Measure time-to-complete and misclicks to prioritize UI refinements.
