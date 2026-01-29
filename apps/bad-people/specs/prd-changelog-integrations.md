# PRD: Changelog + release note integrations

## Summary
Provide integrations for changelogs and release notes via RSS, email, or webhooks.

## Goals
- Automatically notify readers about new releases.
- Provide machine-readable feeds for updates.
- Make release notes easy to publish and share.

## Non-goals
- Full marketing automation or newsletter management.

## User stories
- As a reader, I can subscribe to an RSS feed of releases.
- As an author, I can trigger a webhook when a new version is published.
- As an author, I can send release notes to a mailing list.

## Requirements
- Release notes data model tied to versions.
- RSS feed for releases.
- Webhook event on new release.
- Optional email integration hook (e.g., Mailchimp/ConvertKit).

## UX notes
- Provide a “Release notes” page with clear chronology.
- Include a “Subscribe” button for RSS.

## Data & analytics
- Track subscription clicks and webhook delivery success.

## Risks & mitigations
- **Risk:** Broken feeds or invalid RSS. **Mitigation:** Validate feed format.
- **Risk:** Email integration complexity. **Mitigation:** Start with webhook and RSS.

## Dependencies
- Versioning system and release notes storage.

## Milestones
1. Add release notes schema and UI.
2. Generate RSS feed for releases.
3. Add webhook support for release events.
