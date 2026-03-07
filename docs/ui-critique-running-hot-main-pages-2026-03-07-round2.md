# UI Critique — Running Hot Main Pages/Templates/Components (Round 2)

## Scope
This review is based on fresh screenshots of the main routes and representative templates/components:

- Home: `/`
- Reading hub: `/read`
- List pages: `/read/chapters`, `/read/mechanisms`, `/read/toolkit`, `/read/examples`, `/read/glossary`
- Detail templates: chapter, mechanism, toolkit, example, glossary

## What is working well

1. **Route architecture remains clear and teachable**
   - The `Start here / Solve now / Reference` framing continues to reduce decision overhead for new readers.
2. **Visual consistency is strong across templates**
   - Card shells, spacing rhythm, and typography are coherent across list and detail pages.
3. **Metadata chips improved scan quality**
   - Badges (for example `core`, `guided path`, timebox/domain labels) improve at-a-glance parsing on list routes.
4. **Detail pages now have stronger forward momentum**
   - The new “Next best action” panel near the top makes progression more explicit than before.

## Constructive critique and recommendations

### 1) Avoid duplicated progression blocks on detail pages
- **Observation:** Detail templates now show both a top “Next best action” panel and a lower “Next steps / Keep going” area.
- **Impact:** The same intent appears twice, which can add cognitive noise and dilute primary progression.
- **Recommendation:** Keep one dominant progression pattern per template. Either:
  - keep top panel as primary and simplify lower block to one compact link row, or
  - keep lower block as primary and trim top panel to a single contextual CTA.

### 2) List rows are readable but still too low-contrast for fast scanning
- **Observation:** Badge/eyebrow additions help, but title/meta contrast and row boundaries still read subtle on large desktop screens.
- **Impact:** Quick ranking (“what do I click first?”) is still slower than it should be on dense lists.
- **Recommendation:** Increase vertical rhythm and contrast on row separators, and slightly increase contrast/weight of secondary metadata text.

### 3) Reading hub is content-rich but front-loads too many equal-priority cards
- **Observation:** `/read` presents multiple route cards and supporting blocks with similar visual weight.
- **Impact:** First-time readers may hesitate because there is no single clearly “recommended first click.”
- **Recommendation:** Add a single default recommendation state (e.g., highlighted “recommended start” tile) while preserving alternate routes.

### 4) Header CTA semantics are improved but still a bit ambiguous
- **Observation:** “Reading hub” is clearer than “Start reading” on read routes, but the global nav still competes with in-page path controls.
- **Impact:** Readers may bounce to global actions instead of following page-local progression.
- **Recommendation:** De-emphasize global nav CTAs further on deep detail routes (smaller fill, stronger active breadcrumb/context cue).

### 5) Export panel placement on chapter index creates long-tail page fatigue
- **Observation:** On chapters list pages, export controls appear after a long alphabetized list.
- **Impact:** Useful utility action is visually distant; long page tail feels heavy.
- **Recommendation:** Add a compact sticky or top-inline export shortcut near the section header, while keeping full export panel lower on page.

### 6) Component-level opportunities

#### Site header (`SiteHeader`)
- Keep current route-aware labels, and add stronger active section context (e.g., section name pill next to title on deep routes).

#### Content index list (`ContentIndexList`)
- Keep badges, but support one **priority badge** style variant to avoid all chips feeling equivalent.

#### Next action panel (`NextActionPanel`)
- Keep placement near top, but add optional `variant="compact"` for pages that already have robust bottom navigation.

## Prioritized next pass (implementation order)

1. **Template simplification:** remove duplicate progression affordances (top + bottom) on detail pages.
2. **List scan tuning:** increase row/meta contrast and spacing density for high-volume list routes.
3. **Reading hub defaulting:** add a visual “recommended first step” state.
4. **Header context cue:** reinforce where the reader is in the route graph on deep pages.
5. **Export discoverability:** add top-inline chapter export shortcut.

## Risk and migration notes

- **Risk level:** low-to-moderate (primarily presentation/flow adjustments, no schema or validator changes).
- **Migration impact:** none expected on content model; this is UI/interaction hierarchy work.
