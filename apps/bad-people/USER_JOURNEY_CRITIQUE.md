# Mobile User Journey Critique (Bad People)

This review traverses three common reader journeys on a narrow mobile viewport and critiques them constructively.

## Scope and method

- Traversed these route sequences in a running local app:
  1. Home (`/`) → Reading hub (`/read`) → Chapters (`/read/chapters`)
  2. Reading hub (`/read`) → Mechanisms index (`/read/mechanisms`) → Mechanism detail (`/read/mechanisms/coercive-waiting`)
  3. Home/Read entry → Release notes (`/release-notes`)
- Verified rendered route structure with local requests and extracted heading/link affordances from each page.
- Focus of critique: information scent, tap efficiency, orientation, and continuity on phone-sized screens.

---

## Journey 1: New reader onboarding

**Path:** `/` → `/read` → `/read/chapters`

### What works well on mobile
- Home gives a clear pair of top-level choices (“Open the reading hub” and “Browse release notes”), limiting decision overload for first tap.
- Reading hub now includes an explicit “Recommended paths” band with a framing chapter CTA, which reduces first-session uncertainty.
- Chapters list is compact and scan-friendly; export actions are grouped in the same screen so users can switch to offline quickly.

### Friction observed
- The global header has many actions (Read, Release notes, Downloads, Search, Ask, Shortcuts). On small screens this wraps into multiple rows, competing with page content before a user starts reading.
- Chapter status labels (e.g., `draft`) are visible but low-context; a first-time reader may not know whether draft means incomplete, unstable, or lightly edited.
- Export links appear as utility rows with file size/date metadata, but the “when should I use this?” cue is not explicit.

### Constructive improvements
1. Prioritize mobile header actions via progressive disclosure (e.g., keep Read + Search visible, move secondary controls behind a “More” control).
2. Add one-line draft-state helper copy near the first draft label in chapter lists (e.g., “Draft = content may change, concepts remain stable”).
3. Add a tiny decision hint for exports (“PDF for print/share, EPUB for long-form mobile reading”).

---

## Journey 2: Problem-focused concept lookup

**Path:** `/read` → `/read/mechanisms` → `/read/mechanisms/coercive-waiting`

### What works well on mobile
- Mechanism index has lightweight metadata chips (“core”, “high leverage”, etc.) that improve scanability.
- Mechanism detail includes immediate in-page jump links (Definition / How to recognize it / Next steps / Keep going), which is highly mobile-friendly for long documents.
- Breadcrumb/back affordances are present, so users can recover context after deep-linking.

### Friction observed
- The alphabet nav at top of mechanisms is useful for dense catalogs, but in this small list it consumes vertical space before first meaningful card.
- Card descriptions in mechanism index are informative but long; on narrow widths, more text means fewer items visible per scroll segment.
- “Keep going” links are helpful but look similar in visual hierarchy to section links; priority action may not be obvious.

### Constructive improvements
1. Collapse or conditionally show alphabet nav only when list size crosses a threshold (or after user scrolls).
2. Clamp mechanism card description to 2 lines on mobile with a stronger first sentence.
3. Elevate one recommended “next action” style (primary pill/button) and keep other continuation links secondary.

---

## Journey 3: Returning user checking updates

**Path:** `/` or `/read` → `/release-notes`

### What works well on mobile
- Release notes are first-class and easy to find from both home and reading hub.
- Latest release summary is already surfaced in reading hub (`Latest update: v...`), reducing the hop cost for return readers.
- RSS link is explicit and useful for users who prefer push-like update tracking.

### Friction observed
- “What changed for me” still requires manual scanning across entries; there is no “since last visit” state on the release list.
- Release entries are content-rich, but the user-impact takeaway is not consistently front-loaded for skim reading on phones.
- Update awareness is present on hub cards (“Updated in v...”), but no quick filter exists to show only recently changed reading surfaces.

### Constructive improvements
1. Add a lightweight “since last visit” marker/filter on release notes and optionally the reading hub cards.
2. Standardize a short “reader impact” sentence at top of each release entry.
3. Add a quick toggle on the reading hub (e.g., “Show updated only”) to reduce scanning cost.

---

## Priority recommendations

1. **Highest impact:** Simplify mobile header action density (primary vs secondary actions).
2. **High impact:** Add “since last visit” highlighting/filtering for updates.
3. **Medium impact:** Clarify draft-state meaning inline in chapter lists.
4. **Medium impact:** Reduce mechanism-index above-the-fold overhead (conditional alpha nav).

## Notes

- Local browser automation for screenshots was attempted but failed in this environment due a Playwright Chromium crash (SIGSEGV), so this critique is based on route traversal plus rendered HTML structure checks.
