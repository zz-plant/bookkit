# PRD: Access control for drafts/private previews

## Summary
Allow authors to share draft or private previews via invite or tokenized links.

## Goals
- Restrict draft content to invited readers.
- Support easy sharing for review without full public release.
- Provide revocable access.

## Non-goals
- Full enterprise identity management (SSO) in v1.
- Paid subscription billing.

## User stories
- As an author, I can generate a private preview link to share with reviewers.
- As an author, I can revoke a link if it leaks.
- As a reader, I can access the preview without creating an account.

## Requirements
- Private preview mode (tokenized or invite-based).
- Ability to set expiration for preview links.
- Minimal UI indicator that the reader is viewing a preview.
- Prevent indexing of private content.

## UX notes
- Show a subtle “Preview” badge on private pages.
- Provide a simple “copy link” action in the author UI.

## Data & analytics
- Track preview access counts and link usage.

## Risks & mitigations
- **Risk:** Link leakage. **Mitigation:** Expirable tokens and revocation.
- **Risk:** SEO exposure. **Mitigation:** noindex headers for private routes.

## Dependencies
- Auth/token storage.
- Routing checks for private content.

## Milestones
1. Implement tokenized preview links and access checks.
2. Add author UI to manage preview links.
3. Add analytics for preview usage.
