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

// Example for an RSS feed endpoint (e.g., pages/rss.xml.ts)
export const { GET } = createReleaseNotesRssEndpoint({
  modules: releaseModules,
  siteUrl,
  bookTitle,
});

// Example for a webhook endpoint (e.g., pages/api/webhooks.ts)
export const { POST } = createReleaseWebhookEndpoint({
  modules: releaseModules,
  book: { slug: bookConfig.slug, title: bookConfig.title },
});
```

## Environment variables

- `BOOKKIT_RELEASE_WEBHOOKS`
- `BOOKKIT_RELEASE_EMAIL_TARGETS`

Each variable supports JSON arrays or comma-separated values. Objects may include:
`url`, `name`, `headers`, `secret`, `enabled`, `provider`.

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

