# PRD: Localization pipeline

## Summary
Add localization support with language switcher, routing, and fallback strings.

## Goals
- Support translated versions of the book.
- Provide a clear language switcher in the UI.
- Fallback to default language for missing strings.

## Non-goals
- In-app translation editing or machine translation.
- Translation memory integration in v1.

## User stories
- As a reader, I can switch languages and stay on the same chapter.
- As an author, I can add translated content without restructuring the book.
- As a reader, I see fallback text if a translation is missing.

## Requirements
- Language-aware routing (e.g., `/en/`, `/es/`).
- Language switcher with available locales.
- Fallback language for missing pages/strings.
- Metadata to track translation completeness.

## UX notes
- Keep the language switcher accessible in the header.
- Show a notice if a translation is incomplete.

## Data & analytics
- Track language selection and usage distribution.

## Risks & mitigations
- **Risk:** Content drift between languages. **Mitigation:** Translation completeness indicators.
- **Risk:** SEO duplication. **Mitigation:** hreflang tags and canonical handling.

## Dependencies
- Content structure that can accommodate locales.
- Routing support for language prefixes.

## Milestones
1. Add locale routing and metadata support.
2. Implement language switcher and fallback behavior.
3. Add completeness reporting and hreflang tags.
