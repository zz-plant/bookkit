# UI Review — Running Hot Book (2026-03-07)

## Scope
Reviewed the primary reader-facing pages, route templates, and shared UI components:

- `/`
- `/read`
- `/read/overview`
- `/read/chapters` + chapter detail template
- `/read/mechanisms` + mechanism detail template
- `/read/toolkit` + toolkit detail template
- `/read/examples` + example detail template
- `/read/glossary` + glossary detail template

## What works well

1. **Strong pathway framing for first-time and returning readers**
   - The route buckets (`Start here`, `Solve now`, `Reference`) create clear intent-based navigation.
2. **Consistent visual system across list and detail surfaces**
   - Card, heading, and metadata chip treatments are coherent and make the app feel intentional.
3. **Good author/reader separation in utility areas**
   - Author diagnostics and release links are discoverable without overwhelming the core reading routes.

## Constructive critique and recommendations

### 1) Header hierarchy competes with in-page CTAs
- **Observation:** On deep `/read/*` pages, top-level nav actions (for example `Start reading`) remain visually prominent.
- **Impact:** Global nav competes with page-local next actions and can dilute progression.
- **Recommendation:** Add route-aware nav emphasis (highlight current section, demote already-completed global actions).

### 2) Card-heavy pages need stronger scan anchors
- **Observation:** Index pages with many similarly styled cards can feel visually uniform.
- **Impact:** Users may spend extra time deciding where to click first.
- **Recommendation:** Add lightweight scan aids (section separators, sortable view toggle, or “most used / newest” pins) without changing content model.

### 3) Metadata chips are useful but under-prioritized
- **Observation:** Translation and release-note badges are present but low in emphasis relative to title text.
- **Impact:** Freshness and completeness signals are easy to miss.
- **Recommendation:** Increase contrast/weight of high-value badges and consider a compact “last updated” line near page headings.

### 4) Detail templates could surface “next best action” sooner
- **Observation:** Detail pages are content-rich but do not always expose a clear next-step module near the top.
- **Impact:** Readers can consume one page without obvious momentum into the next executable action.
- **Recommendation:** Add a persistent “Next action” panel (e.g., related toolkit action on mechanism pages, related mechanism on examples).

### 5) Route aliasing and dead-end risk
- **Observation:** Top-level routes like `/chapters`, `/mechanisms`, `/toolkit`, and `/glossary` currently return 404 while equivalent paths exist under `/read/*`.
- **Impact:** Shared/bookmarked links and user URL guessing can hit dead ends.
- **Recommendation:** Add redirects from these top-level aliases to canonical `/read/*` routes.

## Component-focused notes

- **Top navigation / header component**: Strong branding and concise action set; consider adding active-state clarity and responsive collapse behavior checks for narrow viewports.
- **Route cards**: Consistent and readable; add one stronger visual differentiator for primary suggested actions.
- **Metadata badges**: Semantically useful; improve emphasis for state indicators that affect trust and urgency.
- **Footer/meta areas**: Helpful but currently low-signal; consider denser utility grouping to reduce perceived page tail length on tall displays.

## Suggested next pass

1. Implement route-aware header emphasis and active-state treatment.
2. Add canonical redirects for top-level guessed routes (`/chapters`, `/mechanisms`, `/toolkit`, `/glossary`).
3. Prototype a reusable “Next action” block for detail templates.
4. Tune metadata badge contrast and hierarchy on index cards.
