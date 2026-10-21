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

// Example for an RSS feed endpoint (e.g., src/pages/release-notes.xml.ts)
export const { GET } = createReleaseNotesRssEndpoint({
  modules: releaseModules,
  siteUrl,
  bookTitle,
});

// Example for a webhook endpoint (e.g., src/pages/api/release-webhook.json.ts)
export const { POST } = createReleaseWebhookEndpoint({
  modules: releaseModules,
  book: { slug: bookConfig.slug, title: bookConfig.title },
});
```

## Environment variables

- `BOOKKIT_AUTHOR_TOKEN` (required): the webhook and email endpoints send only
  for a request with `Authorization: Bearer <token>`. Without it, or with a value
  under 32 characters, they answer 500 and log why; a wrong token gets 401. This
  holds under `bookkit dev` too.
- `BOOKKIT_RELEASE_WEBHOOKS`
- `BOOKKIT_RELEASE_EMAIL_TARGETS`

The two target variables take JSON arrays or comma-separated URLs. Objects may
include `url`, `name`, `headers`, `secret`, `enabled`, `provider`. The response
names each delivery by its `name`, or by its URL's scheme and host
(`https://hooks.slack.com`), and never includes a target's URL, headers, or
secret. The release log (`release-analytics.jsonl` in the book's data folder)
records the same label, and error messages are cleaned of the target's URL.

```sh
curl -X POST -H "Authorization: Bearer $BOOKKIT_AUTHOR_TOKEN" \
  https://book.example/api/release-webhook.json
```

For repo-wide contribution rules, see root `CONTRIBUTING.md` and `AGENTS.md`.

## Section-level change metadata

`createReleaseNotes()` now supports optional `sectionSnapshots` frontmatter to derive
`changedSections` from deterministic per-section fingerprints.

```yaml
sectionSnapshots:
  overview: sha256:...
  chapters: sha256:...
  mechanisms: sha256:...
```

When snapshots are present, `changedSections` is computed by diffing each release
against the previous release snapshot, and `sectionChangeSource` is set to
`"snapshot-diff"`. This keeps “updated” labels grounded in objective deltas while
remaining backward-compatible with manual `changedSections` when snapshots are not
provided.

