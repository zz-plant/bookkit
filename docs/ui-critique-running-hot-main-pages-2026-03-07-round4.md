# Running Hot UI critique — main pages/templates/components (round 4)

Date: 2026-03-07
Scope: `/read`, major `/read/*` index pages, representative mechanism detail template, shared header/list components.
Method: visual pass from live screenshots plus template review.

## Screens reviewed

- `read-hub.png` (`/read`)
- `read-chapters-index.png` (`/read/chapters`)
- `read-mechanisms-index.png` (`/read/mechanisms`)
- `read-toolkit-index.png` (`/read/toolkit`)
- `read-glossary-index.png` (`/read/glossary`)
- `read-mechanism-detail.png` (`/read/mechanisms/attrition-by-queue`)

---

## What is working well

1. **Clearer utility access on index pages**
   - The shared utility strip makes release notes + offline download actions easy to find without crowding each list item.
2. **Higher scanability in index lists**
   - Eyebrows and badges make rows easier to parse quickly (status/domain/timebox cues).
3. **Better orientation in deep reading routes**
   - Header context and softer CTA emphasis reduce the feeling of competing top-level actions while reading.
4. **Actionability on detail pages is improved**
   - Top-positioned next-action content keeps momentum and reduces “what now?” pauses.

---

## Constructive critique by area

## 1) Main page: Reading hub (`/read`)

### Observations
- The card layout is readable, but high-level copy still does more describing than directing.
- “Recommended” treatment is useful, but first-time readers still need a stronger single-sentence start instruction.

### Recommendations
- Add one concise line directly under the heading: **“Start with Chapters, then move to Mechanisms.”**
- Keep card descriptions short and operational (what the reader gets in < 10 seconds).

---

## 2) Templates: list index pages (`/read/chapters`, `/read/mechanisms`, `/read/toolkit`, `/read/glossary`)

### Observations
- Shared utility strip is a solid upgrade, but sits close to list title in some viewport states.
- List summary is helpful; it could be even more actionable by reflecting filter results when typing.
- Badge hierarchy is mostly good; long badge text can still visually dominate titles when many rows are visible.

### Recommendations
- Add a bit more vertical separation between utility strip and heading block.
- Make list summary reactive (e.g., “8 of 31 items”) when filtering.
- Keep badge labels compact and consistently lower-priority than row titles.

---

## 3) Component critique: `ContentIndexList`

### Observations
- Good progression: heading → summary → filter → alpha nav → list.
- The new summary line gives useful orientation immediately.
- Alpha nav + filter together are strong for long lists.

### Recommendations
- Add optional `summaryLabel` prop so books can tune wording without forking component behavior.
- Consider an “empty filter result” helper line with suggested next query patterns.

---

## 4) Component critique: `SiteHeader`

### Observations
- Route-aware context is helpful and visually lightweight.
- Deep-route de-emphasis of primary CTA is directionally right.
- Brand row can become dense when version badge + context + controls all appear.

### Recommendations
- Keep context chip short and non-repetitive with page title.
- On narrow widths, prioritize nav readability over auxiliary badges.

---

## 5) Template critique: mechanism detail page (`/read/mechanisms/[slug]`)

### Observations
- Top-of-page action panel improves progression.
- Breadcrumbs and metadata support orientation well.
- Content body rhythm is good, but first action could be even easier to spot.

### Recommendations
- Consider a stronger visual separation for the first executable action block.
- Standardize “next action” phrasing so users recognize the pattern instantly across mechanisms/toolkit/examples.

---

## Priority follow-ups (recommended order)

1. **Filter-result-aware list summary** in shared `ContentIndexList`.
2. **Minor spacing tune** between utility strip and index heading.
3. **Read hub instruction copy tightening** for first-time readers.
4. **Responsive header density pass** to preserve clarity on narrow screens.

---

## Notes on architectural fit

- Most improvements above are best handled in shared Bookkit components/styles (`ContentIndexList`, `SiteHeader`, shared page utilities), then consumed by books.
- Book-level pages should mainly provide content mapping + route copy, not bespoke structural behavior.
