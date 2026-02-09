# Release integration helpers

Shared utilities support release-note workflows across books:

- `createReleaseNotes()` for normalized release data
- `createReleaseNotesRss()` + endpoint helper for RSS feeds
- `sendReleaseWebhooks()` + endpoint helper for webhook notifications
- `sendReleaseEmailHooks()` + endpoint helper for email integrations

## Endpoint usage

```ts
import {
  createReleaseNotesRssEndpoint,
  createReleaseWebhookEndpoint,
  createReleaseEmailEndpoint,
} from "@bookkit/astro-bookkit";
```

## Environment variables

- `BOOKKIT_RELEASE_WEBHOOKS`
- `BOOKKIT_RELEASE_EMAIL_TARGETS`

Each variable supports JSON arrays or comma-separated values. Objects may include:
`url`, `name`, `headers`, `secret`, `enabled`, `provider`.

For repo-wide contribution rules, see root `CONTRIBUTING.md` and `AGENTS.md`.
