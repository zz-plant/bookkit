# PRD: Custom domain + SEO controls

## Summary
Enable custom domains and provide SEO controls for better discoverability and sharing.

## Goals
- Support hosting the book on a custom domain.
- Provide easy control over metadata (title, description, OG images).
- Ensure search engines index the intended pages.

## Non-goals
- Complex multi-site domain management.
- Paid domain registration flows.

## User stories
- As an author, I can connect a custom domain to the book.
- As an author, I can set per-page metadata and OG images.
- As a reader, shared links render rich previews.

## Requirements
- Configurable domain mapping and HTTPS enforcement.
- Page-level metadata defaults and overrides.
- Automatic generation of sitemap.xml and robots.txt.
- Canonical URL handling for versions.

## UX notes
- Provide a simple configuration UI or config file instructions.
- Show preview of Open Graph metadata.

## Data & analytics
- Track click-through from shared previews if possible.

## Risks & mitigations
- **Risk:** SEO duplication with versions. **Mitigation:** Canonical tags and noindex for archive pages as needed.
- **Risk:** Misconfigured DNS. **Mitigation:** Clear setup instructions and validation.

## Dependencies
- Hosting environment capable of custom domain routing.
- Metadata configuration in the rendering pipeline.

## Milestones
1. Implement domain mapping + HTTPS support.
2. Add metadata controls and defaults.
3. Generate sitemap/robots and canonical tags.
