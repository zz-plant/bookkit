# Current feature specs — Bad People (app layer)

This document captures the feature set **as implemented in the Bad People app**.
It focuses on the `apps/bad-people` surfaces and wiring that sit on top of the
Bookkit engine.

## Feature inventory (as built)

| Feature | Status | Primary surfaces |
| --- | --- | --- |
| Reading hub + overview | Implemented | `/read`, `/read/overview` |
| Content indexes (chapters, mechanisms, toolkit, glossary, examples) | Implemented | `/read/*` index pages |
| Global search | Implemented | Search panel in `BookLayout` + `/search-index.json` |
| AI-assisted Q&A (local matching) | Implemented | Q&A panel in `BookLayout` + `/search-index.json` |
| Versioned releases + version switcher | Implemented | `/release-notes`, version switcher in `BookLayout` |
| Reader feedback widgets | Implemented | Feedback widget in reading UI + `/api/feedback.json` |
| Export formats (PDF/EPUB) | Implemented | `/exports/*`, export panel in chapter list |
| Custom domain + SEO controls | Implemented | `book.config.ts` + `sitemap.xml`/`robots.txt` |
| Analytics dashboard | Implemented | `/read/analytics` + `/api/analytics.json` |
| Draft/preview access control | Implemented | preview middleware + `/api/preview-analytics.json` |
| Localization pipeline | Implemented | locale middleware + localized content indexes |
| Changelog + release note integrations | Implemented | `/release-notes.xml` + `/api/release-*` |

## Feature specs

### Reading hub + overview

**What ships**
- A reading hub landing page that summarizes sections, counts, and translation completeness.
- A separate overview page for objectives, frame, and constraints.

**Primary surfaces**
- `/read` for the hub.
- `/read/overview` for the configuration overview.

**Implementation notes**
- The hub builds localized content indexes and surfaces section cards with counts and shortcuts.
- The overview page is driven by `book.config.ts` values (objectives, frame, constraints).

**Source references**
- `apps/bad-people/src/pages/read/index.astro`
- `apps/bad-people/src/pages/read/overview.astro`

### Content index views

**What ships**
- Filterable index lists for chapters, mechanisms, toolkit, glossary, and examples.
- Auto-generated alphabetical jump navigation and search filtering for longer lists.

**Primary surfaces**
- `/read/chapters`, `/read/mechanisms`, `/read/toolkit`, `/read/glossary`, `/read/examples`.

**Implementation notes**
- Index pages use `ContentIndexList` for consistent list behaviors, including filter + alpha nav.
- Lists are localized via `createLocalizedContentList` with fallback and completeness labeling.

**Source references**
- `apps/bad-people/src/pages/read/chapters/index.astro`
- `packages/astro-bookkit/src/components/ContentIndexList.astro`

### Global search

**What ships**
- Search panel UI embedded in the shared `BookLayout` with keyboard toggles.
- Search index API at `/search-index.json`, returning prebuilt entries from content modules.

**Primary surfaces**
- Search toggle in the reading UI (`BookLayout`).
- `/search-index.json` endpoint.

**Implementation notes**
- The search panel loads and filters the JSON index on demand, highlights matches, and records events.
- `createBookSearchIndexEndpoint`/`createLocalizedSearchIndexEndpoint` compile the index response.

**Source references**
- `apps/bad-people/src/pages/search-index.json.ts`
- `packages/astro-bookkit/src/layouts/BookLayout.astro`

### AI-assisted Q&A (local matching)

**What ships**
- An on-page Q&A panel that matches user questions to search index entries and cites passages.
- Optional disable/enable toggle in the panel for reader opt-out.

**Primary surfaces**
- Q&A panel in `BookLayout`.

**Implementation notes**
- Q&A uses the same search index as global search (no external model calls) and surfaces citations.
- Feature toggle is wired through `book.config.ts` → `createBookLayoutState` → `BookLayout`.

**Source references**
- `apps/bad-people/src/book.config.ts`
- `packages/astro-bookkit/src/book/layout.ts`
- `packages/astro-bookkit/src/layouts/BookLayout.astro`

### Versioned releases + version switcher

**What ships**
- Release notes page with RSS subscriptions.
- Version switcher in the shared layout.

**Primary surfaces**
- `/release-notes` and `/release-notes.xml`.
- Version switcher in `BookLayout` (enabled via version entries).

**Implementation notes**
- Versions are derived from release note modules using `createBookVersionEntriesFromReleaseModules`.
- RSS + release integrations are backed by engine helpers (`createReleaseNotesRssEndpoint`, webhooks/email endpoints).

**Source references**
- `apps/bad-people/src/pages/release-notes.astro`
- `apps/bad-people/src/lib/versions.ts`
- `packages/astro-bookkit/src/components/VersionSwitcher.astro`

### Reader feedback widgets

**What ships**
- Reader feedback widget for per-chapter helpfulness and comments.
- Feedback dashboard on the author analytics page.

**Primary surfaces**
- Feedback widget in `BookLayout`.
- `/api/feedback.json` endpoint.
- `/read/analytics` dashboard.

**Implementation notes**
- Feedback events are collected via `createFeedbackEndpoint` and surfaced in `FeedbackDashboard`.

**Source references**
- `apps/bad-people/src/pages/api/feedback.json.ts`
- `apps/bad-people/src/pages/read/analytics.astro`
- `packages/astro-bookkit/src/components/FeedbackWidget.astro`

### Export formats (PDF/EPUB)

**What ships**
- Full-book and per-chapter PDF/EPUB exports.
- Export panel in the chapter index for quick downloads.

**Primary surfaces**
- `/exports/book.pdf`, `/exports/book.epub`, `/exports/chapters/[slug].pdf`, `/exports/chapters/[slug].epub`.
- Export panel in `/read/chapters`.

**Implementation notes**
- Export helpers are created from book config + chapter modules.
- Export analytics events are optionally posted to `/api/export-analytics.json`.

**Source references**
- `apps/bad-people/src/lib/exports.ts`
- `apps/bad-people/src/pages/exports/book.pdf.ts`
- `apps/bad-people/src/pages/read/chapters/index.astro`
- `packages/astro-bookkit/src/exports/index.ts`

### Custom domain + SEO controls

**What ships**
- Site URL configuration + default meta in `book.config.ts`.
- Generated sitemap and robots.txt outputs.

**Primary surfaces**
- `/sitemap.xml`
- `/robots.txt`

**Implementation notes**
- `createBookSitemapEntries` + `createSitemapXml` assemble the sitemap using book content modules.
- `createBookRobotsTxt` respects `site.indexable` and the configured site URL.

**Source references**
- `apps/bad-people/src/book.config.ts`
- `apps/bad-people/src/pages/sitemap.xml.ts`
- `apps/bad-people/src/pages/robots.txt.ts`

### Analytics dashboard

**What ships**
- Reader analytics endpoint + author-facing dashboard.
- Export and search events are emitted from the layout UI.

**Primary surfaces**
- `/read/analytics` for dashboards.
- `/api/analytics.json` for reader analytics collection.

**Implementation notes**
- Analytics are stored locally and visualized in `AnalyticsDashboard`.
- The shared `BookLayout` emits events for searches, exports, and Q&A usage.

**Source references**
- `apps/bad-people/src/pages/read/analytics.astro`
- `apps/bad-people/src/pages/api/analytics.json.ts`
- `packages/astro-bookkit/src/components/AnalyticsDashboard.astro`
- `packages/astro-bookkit/src/layouts/BookLayout.astro`

### Draft/preview access control

**What ships**
- Preview access middleware with token-based links and expiration.
- Preview analytics endpoint and author-facing preview link panel.

**Primary surfaces**
- Preview tokens configured in `book.config.ts`.
- `/api/preview-analytics.json`.
- Preview link panel on `/read/analytics`.

**Implementation notes**
- Preview access is enforced by `createBookMiddleware` via `previewAccess` config.
- The preview dashboard surfaces tokens via `PreviewLinksPanel`.

**Source references**
- `apps/bad-people/src/book.config.ts`
- `apps/bad-people/src/middleware.ts`
- `apps/bad-people/src/pages/api/preview-analytics.json.ts`
- `apps/bad-people/src/pages/read/analytics.astro`

### Localization pipeline

**What ships**
- Locale-aware routing + content resolution with completeness tracking.
- Locale switcher in the shared layout.

**Primary surfaces**
- Locale options configured in `book.config.ts`.
- Locale middleware in `createBookMiddleware`.
- Localized content lists on the reading hub and index pages.

**Implementation notes**
- Locale-aware indexes are built via `buildLocalizedContentIndex` and `createLocalizedContentList`.
- Locale metadata is surfaced in `createBookLayoutState` for layout rendering.

**Source references**
- `apps/bad-people/src/book.config.ts`
- `apps/bad-people/src/middleware.ts`
- `apps/bad-people/src/pages/read/index.astro`
- `packages/astro-bookkit/src/book/layout.ts`

### Changelog + release note integrations

**What ships**
- RSS feed for release notes.
- Optional webhook + email integrations for release notifications.

**Primary surfaces**
- `/release-notes.xml` (RSS feed).
- `/api/release-webhook.json` and `/api/release-email.json` integration endpoints.

**Implementation notes**
- Release integrations are wired via engine endpoints and reuse the same release modules.

**Source references**
- `apps/bad-people/src/pages/release-notes.xml.ts`
- `apps/bad-people/src/pages/api/release-webhook.json.ts`
- `apps/bad-people/src/pages/api/release-email.json.ts`
- `packages/astro-bookkit/src/releases/endpoint.ts`
