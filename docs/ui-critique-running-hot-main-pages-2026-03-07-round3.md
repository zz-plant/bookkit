# UI Critique — Running Hot Main Pages/Templates/Components (Round 3)

## Scope
This pass reviews the current state of core reader-facing routes and reusable templates, using fresh screenshots from:

- `/`
- `/read`
- `/read/overview`
- `/read/chapters`, `/read/mechanisms`, `/read/toolkit`, `/read/examples`, `/read/glossary`
- detail templates for chapter/mechanism/toolkit/example/glossary

## What is working well

1. **Routing model is understandable and stable**
   - The start/solve/reference structure is now easier to parse than earlier drafts.
2. **Progression cues improved on detail pages**
   - The top action panel helps maintain momentum without requiring readers to scroll to the bottom first.
3. **Metadata affordances are better than baseline**
   - Badge chips and eyebrow rows improve quick pattern recognition in long lists.
4. **Cross-page visual consistency remains strong**
   - Shared card rhythm, heading scale, and spacing maintain confidence while moving between templates.

## Constructive critique and recommendations

### 1) “Recommended start” is useful, but still visually close to sibling cards
- **Observation:** The recommended quick-start tile is present, but on desktop it remains close in weight to adjacent cards.
- **Impact:** New readers may still pause because the default path does not stand out enough in first-glance scanning.
- **Recommendation:** Increase recommendation contrast one more step (stronger border/fill or tiny icon/label marker) and reduce secondary card emphasis slightly.

### 2) List pages still feel long on large viewports
- **Observation:** Chapters/mechanisms pages read as long uninterrupted vertical streams.
- **Impact:** Navigation fatigue appears on tall displays; readers can lose place while scanning.
- **Recommendation:** Add optional list density toggle or lightweight section break markers every N items to preserve orientation.

### 3) Detail-page “next action” panel can be more specific by template
- **Observation:** The panel is consistently placed, but language/actions still feel generic in some templates.
- **Impact:** Readers get direction, but not always the strongest immediate action for that page type.
- **Recommendation:** Use template-specific first CTA rules (e.g., mechanism -> shortest related tool, example -> mechanism definition anchor, glossary -> best matching mechanism).

### 4) Header context cue helps, but hierarchy can be sharpened
- **Observation:** Active read-section cue is useful; however global top-nav actions still pull attention on deep content routes.
- **Impact:** Global controls can compete with in-flow reading progression.
- **Recommendation:** Further reduce global CTA visual prominence when inside deep `/read/*` detail routes and rely on the section context chip + breadcrumbs for orientation.

### 5) Export discoverability improved, but utility actions are still split
- **Observation:** Chapter export jump link helps, but utility actions remain distributed across page regions.
- **Impact:** Readers may not build a clear mental model of “where utility actions live.”
- **Recommendation:** Define a reusable utility cluster pattern (same position/treatment across list pages) for export/release/maintenance actions.

## Component-level notes

### `NextActionPanel`
- Keep the component and compact variant.
- Add a small optional “why this action” hint slot for context-sensitive guidance.

### `ContentIndexList`
- Keep badge support.
- Add optional `priorityBadge` style to separate critical state from informational chips.

### `SiteHeader`
- Keep active section context chip.
- Add a deep-route mode class to reduce global CTA contrast while preserving accessibility.

## Suggested implementation order

1. Strengthen recommended-start visual hierarchy on `/read`.
2. Add template-specific first-CTA rules in `NextActionPanel` usage.
3. Introduce a consistent utility-cluster pattern on list pages.
4. Add optional list-orientation aids for long index pages.
5. Add deep-route header de-emphasis mode.

## Risk/migration notes

- **Risk level:** low-to-moderate (mostly presentation and interaction hierarchy).
- **Migration impact:** none expected for content models or schema validation.
