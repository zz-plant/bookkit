# Release notes integrations

Bookkit ships shared helpers for release notes workflows:

- **Release notes data** via `createReleaseNotes()`.
- **RSS feed generation** via `createReleaseNotesRss()` and the endpoint helper.
- **Webhook delivery** via `sendReleaseWebhooks()` and the endpoint helper.
- **Email integration hook** via `sendReleaseEmailHooks()` and the endpoint helper.

## Endpoint helpers

```ts
import {
  createReleaseNotesRssEndpoint,
  createReleaseWebhookEndpoint,
  createReleaseEmailEndpoint,
} from "@bookkit/astro-bookkit";

export const { GET } = createReleaseNotesRssEndpoint({
  modules: releaseModules,
  siteUrl,
  bookTitle,
});

export const { POST } = createReleaseWebhookEndpoint({
  modules: releaseModules,
  book: { slug: bookConfig.slug, title: bookConfig.title },
});

export const { POST } = createReleaseEmailEndpoint({
  modules: releaseModules,
  book: { slug: bookConfig.slug, title: bookConfig.title },
});
```

### Config

- `BOOKKIT_RELEASE_WEBHOOKS`: JSON array or comma-separated list of webhook URLs.
- `BOOKKIT_RELEASE_EMAIL_TARGETS`: JSON array or comma-separated list of email integration URLs.

Targets can optionally include `{ url, name, headers, secret, enabled, provider }`.
