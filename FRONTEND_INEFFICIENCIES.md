# Front-end inefficiencies and antipatterns audit

1. **Monolithic UI runtime bundle** — `ui.ts` handles keyboard shortcuts, search, QA, nav overflow, reader preferences, export tracking, and heading navigation in one large client file, which increases initial parse/execute cost and makes progressive loading difficult.
2. **Always-loading client scripts from layout** — the base layout includes UI, analytics, and mermaid scripts on every page, even when a page has no mermaid blocks and may not need analytics interactions.
3. **Excessive eager DOM querying** — `ui.ts` performs many `querySelector` calls at module start regardless of route/component presence, doing unnecessary work on pages where most controls do not exist.
4. **Synchronous localStorage hot-path writes for analytics** — search/export/qa tracking repeatedly reads, parses, appends, and rewrites localStorage arrays on interaction-heavy paths.
5. **Duplicate search scoring pipelines** — both search and QA build near-identical tokenized `searchText` and scoring flows, duplicating CPU work and increasing maintenance cost.
6. **Heavy use of `innerHTML` rendering for dynamic panels** — search and QA result rendering builds full HTML strings repeatedly, causing frequent HTML parsing and GC churn compared with incremental node updates.
7. **Speculative index fetch before user intent** — `warmSearchIndex()` preloads `/search-index.json` during idle/timeout even if users never open search or QA.
8. **Potential async result races in search/QA** — async search/QA runs are not canceled with an `AbortController` or request token strategy, so slower older runs can overwrite newer UI state.
9. **Inline page scripts/styles reduce cache reuse** — `read/index.astro` embeds a substantial inline `<script>` and large page-local `<style>`, increasing HTML payload and reducing long-term caching efficiency.
10. **Hard-coded, book-specific client storage key** — onboarding state uses a literal `running-hot.reader.started`, which doesn’t scale cleanly across additional books/locales/versions and can cause key collisions in shared origins.

## Suggested refactoring directions

- Split `ui.ts` into route/feature islands (search, QA, shortcuts, reader prefs) and lazy-load each only when controls are present.
- Load mermaid script conditionally from server-side detection, or defer loading until a mermaid block intersects viewport.
- Replace interaction-log localStorage arrays with batched in-memory queues and periodic flushes.
- Extract shared rank/search utilities used by both search and QA.
- Move inline page script/style into static assets and import through bundled modules.
