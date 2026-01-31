# Current feature specs — Bookkit engine

This document captures the **engine-level features** implemented in
`packages/astro-bookkit`. It focuses on reusable capabilities that book apps
can wire into their own surfaces.

## Feature inventory (engine)

| Capability | Status | Primary modules |
| --- | --- | --- |
| Frames + validation | Implemented | `frames/`, `validators/` |
| Search indexing + endpoints | Implemented | `search/` |
| AI-assisted Q&A UI (local matching) | Implemented | `layouts/BookLayout.astro` |
| Export pipelines (PDF/EPUB) | Implemented | `exports/` |
| Release notes + version utilities | Implemented | `releases/` |
| Analytics endpoints | Implemented | `analytics/`, `exports/analytics.ts` |
| Reader feedback collection | Implemented | `feedback/` |
| Preview access controls | Implemented | `preview/` |
| Localization utilities | Implemented | `localization/` |
| SEO helpers | Implemented | `seo/` |
| Shared UI components | Implemented | `components/`, `layouts/` |

## Capability specs

### Frames + validation

**What ships**
- Frame definitions with required steps (e.g., intervention, explainer, field-guide).
- Validators for frame steps and definitions to enforce structure.

**Primary modules**
- `packages/astro-bookkit/src/frames/*`
- `packages/astro-bookkit/src/validators/frame.ts`

**Implementation notes**
- Default frames are registered via `registerDefaultFrames` and enforced via validation helpers.
- Validation surfaces are used by book tooling to keep modules structurally compliant.

### Search indexing + endpoints

**What ships**
- Search entry builder that summarizes content and creates searchable entries.
- Endpoint helpers to serve a JSON search index (localized or default).

**Primary modules**
- `packages/astro-bookkit/src/search/*`

**Implementation notes**
- `buildSearchEntries` composes entries from content modules with context and snippets.
- `createBookSearchIndexEndpoint` and `createLocalizedSearchIndexEndpoint` generate API handlers.

### AI-assisted Q&A UI (local matching)

**What ships**
- Q&A panel UI with local matching against the search index (no external model calls).
- Reader-side opt-out toggle within the UI.

**Primary modules**
- `packages/astro-bookkit/src/layouts/BookLayout.astro`

**Implementation notes**
- The Q&A panel reuses the search index to surface citations.
- Feature enablement is controlled by `bookConfig.features.aiQa` in layout state.

### Export pipelines (PDF/EPUB)

**What ships**
- PDF and EPUB renderers for full-book or per-chapter bundles.
- Helper utilities to build export bundles, metadata, and download links.

**Primary modules**
- `packages/astro-bookkit/src/exports/*`

**Implementation notes**
- `createPdfExport` and `createEpubExport` render the export payloads.
- `createExportResponse` builds an API response with correct content types.

### Release notes + version utilities

**What ships**
- Release note parsing from content modules.
- Version entry helpers and routing middleware.
- RSS feed generation and webhook/email integration endpoints.

**Primary modules**
- `packages/astro-bookkit/src/releases/*`

**Implementation notes**
- `createReleaseNotes` and `createVersionEntries` convert release modules into UI-ready data.
- `createReleaseNotesRssEndpoint` and integration endpoints provide outbound hooks.

### Analytics endpoints

**What ships**
- Reader analytics endpoint + storage helpers for session event capture.
- Export analytics endpoint + analytics logging for downloads.

**Primary modules**
- `packages/astro-bookkit/src/analytics/*`
- `packages/astro-bookkit/src/exports/analytics.ts`

**Implementation notes**
- `createReaderAnalyticsEndpoint` handles POST/GET analytics events.
- `recordExportEvent` logs export download telemetry to local JSONL.

### Reader feedback collection

**What ships**
- Feedback endpoint for helpfulness and comments.
- Dashboard component to visualize feedback in author views.

**Primary modules**
- `packages/astro-bookkit/src/feedback/endpoint.ts`
- `packages/astro-bookkit/src/components/FeedbackDashboard.astro`

**Implementation notes**
- Feedback is persisted to JSON storage and merged for replay in dashboards.

### Preview access controls

**What ships**
- Preview access middleware with token validation and expiration.
- Preview analytics endpoint and helper utilities for building preview links.

**Primary modules**
- `packages/astro-bookkit/src/preview/*`

**Implementation notes**
- `createPreviewAccessMiddleware` gates protected routes via tokenized links.
- `createPreviewLinks` builds labeled links for sharing.

### Localization utilities

**What ships**
- Locale routing helpers and middleware.
- Content index builders with completeness tracking.

**Primary modules**
- `packages/astro-bookkit/src/localization/*`

**Implementation notes**
- `buildLocalizedContentIndex` and `createLocalizedContentList` return localized index data.
- `calculateLocaleCompleteness` aggregates translation coverage per locale.

### SEO helpers

**What ships**
- Canonical URL generation and metadata helpers.
- Sitemap and robots.txt builders.

**Primary modules**
- `packages/astro-bookkit/src/seo/*`

**Implementation notes**
- `buildSeoProps` resolves meta/OG tags with site config.
- `createBookSitemapEntries` and `createBookRobotsTxt` generate outputs for book apps.

### Shared UI components

**What ships**
- Book layout with search, Q&A, export analytics, and navigation utilities.
- Reusable list, export, analytics, feedback, and release components.

**Primary modules**
- `packages/astro-bookkit/src/layouts/BookLayout.astro`
- `packages/astro-bookkit/src/components/*`

**Implementation notes**
- `createBookLayoutState` wires book config into layout behaviors (SEO, locales, preview, versions).
