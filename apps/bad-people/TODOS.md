# Bad People — TODOs

## Book setup
- [x] Define the book objectives, frame, and constraints in `src/book.config.ts`.
- [x] Add initial mechanism definitions under `src/content/book/mechanisms/`.
- [x] Draft action primitives under `src/content/book/toolkit/`.

## Content drafting
### Core content
- [x] Create chapter outlines in `src/content/book/chapters/`.
- [x] Add replaceable examples in `src/content/book/examples/`.
- [x] Add glossary entries in `src/content/book/glossary/`.

### Insight modules (insight → change → enable)
- [x] System transfer: “The system isn’t failing; it’s succeeding at transfer.”
- [x] Bureaucracy as moral technology (leverage: documentation, escalation, publicness).
- [x] Nice person trap (separate warmth from compliance).
- [x] Policy as unowned judgment (decision-maker tracing scripts).
- [x] Hidden labor tax (admin work as imposed workload; refusal policy).
- [x] Moral fatigue as coerced empathy (boundary language scripts).
- [x] Human crumple zones (reversal paths and repair mechanisms).
- [x] Delay as force (follow-up/CC/deadline tactics).
- [x] Consent fiction (tactics vs purity; minimize exposure, document harm).
- [x] Compliance ladder (pre-decided stop points and exit ramps).
- [x] Safety/ethics as reputation membrane (reversibility/transparency/remedy checks).
- [x] Performance of fairness (impact language and accommodation prompts).
- [x] Abstraction advantage (template-ready impact narratives: dates, numbers, obligations).
- [x] Bad people misdiagnosis (shift from villains to incentive changes).
- [x] Boundaries as infrastructure (repeatable scripts and protocols).
- [x] Repair refusal → escalation (normalize escalation tactics).
- [x] Dignity bargain (clarity over submission).
- [x] Reversal capacity divide (docs, allies, buffers).
- [x] Heal vs leverage (inner stability + outer tactics).
- [x] Goodness without skill is extractable (core promise framing).

## App scaffolding
- [x] Expand `src/pages/` with routes for reading views.
- [x] Add layout refinements and typography tokens in `src/styles/`.

## Specs
- [x] Global search with section-aware results, highlighting, and keyboard shortcuts (GitBook/ReadMe-style doc search). See: `specs/prd-global-search.md`.
- [x] Versioned releases with a visible version switcher and diff-friendly permalinks (GitBook/Docusaurus). See: `specs/prd-versioned-releases.md`.
- [x] Reader feedback widgets (inline "was this helpful", quick reactions, and optional comments). See: `specs/prd-reader-feedback.md`.
- [x] Export formats (PDF/EPUB) with styled covers and per-chapter downloads. See: `specs/prd-export-formats.md`.
- [x] Custom domain + SEO controls (open graph, canonical URLs, sitemap, robots). See: `specs/prd-seo-custom-domain.md`.
- [x] Analytics dashboard for chapter-level engagement and drop-off. See: `specs/prd-analytics-dashboard.md`.
- [x] Access control for drafts/private previews (invite-only or tokenized preview links). See: `specs/prd-access-control.md`.
- [x] Localization pipeline for translations with language switcher and fallback strings. See: `specs/prd-localization.md`.
- [x] Integrations for changelog + release notes (RSS, email, or webhook). See: `specs/prd-changelog-integrations.md`.
- [x] AI-powered Q&A over book content with citations and opt-out toggle. See: `specs/prd-ai-qa.md`.
- [x] Reading hub + overview for navigating core sections. See: `specs/prd-reading-hub.md`.
- [x] Content index views for chapters, mechanisms, toolkit, glossary, and examples. See: `specs/prd-content-indexes.md`.

## Roadmap
- [x] Build the search index pipeline and UI (Algolia/Meilisearch or local index).
- [x] Add versioning primitives (content snapshotting, version metadata, and routing).
- [x] Implement reader feedback capture + review workflow for authors.
- [x] Ship PDF/EPUB export tooling with print-ready styling.
- [x] Add custom domain support and SEO controls.
- [x] Add analytics ingestion + dashboard views for authors.
- [x] Add access control for private previews and draft sharing.
- [x] Add localization scaffolding (i18n routing, language metadata, fallback strings).
- [x] Add integrations for changelog + RSS/webhooks.
- [x] Prototype AI Q&A experience with citation-required answers.
