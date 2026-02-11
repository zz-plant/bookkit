# UX Audit — `apps/bad-people` (Bookkit)

Date: 2026-02-11  
Scope: information architecture, navigation clarity, conversion-to-reading flow, mobile behavior, and content discoverability.

## Method

- Reviewed desktop and mobile rendering of `/`, `/read`, `/release-notes`, and `/read/chapters`.
- Mapped findings to current layout/navigation implementation in shared engine components.
- Prioritized recommendations by reader impact and implementation effort.

---

## Executive summary

The product has a strong editorial visual system (clean typography, good card rhythm, approachable tone), but the **top-of-page navigation and first-action funnel are doing too much at once**.

The biggest UX opportunity is to make one thing obvious:

> “If I’m new, where do I start reading right now?”

Today, the answer exists (“Open the reading hub”), but it competes with search, release notes, downloads, versioning, language, and utility controls in the same visual band.

---

## What is working well

1. **Visual hierarchy in content blocks** is solid: clear sectioning, readable cards, and consistent spacing.
2. **System transparency** is strong: translation completeness, version context, and draft status are exposed.
3. **Pathway framing in `/read`** (“Start where your intent is clear”) is excellent and should be promoted more prominently.
4. **Release notes UX** is concise and skimmable, with useful impact summaries.

---

## High-impact issues and recommendations

## 1) Header information density is too high for first-time readers

### Problem
The global header combines:
- primary reading navigation,
- search trigger,
- overflow utilities,
- version selector,
- language selector.

On small screens this creates cognitive friction before users can begin reading.

### Add / Remove / Move / Modify
- **Add:** a single high-contrast primary CTA in header: `Start reading`.
- **Remove:** non-essential utility controls from immediate header row on first-load mobile view.
- **Move:** version and language controls into a dedicated “View settings” panel (slide-over/drawer or compact menu).
- **Modify:** progressive disclosure so only core reader actions are visible by default.

### Why this matters
Readers choose faster when first options are obvious and scarce.

---

## 2) Navigation labels are semantically inconsistent

### Problem
`Downloads` currently routes to chapter index where exports are included below chapter list, creating expectation mismatch.

### Add / Remove / Move / Modify
- **Add:** dedicated `/downloads` landing surface with file formats, what each is for, and per-chapter/full-book options.
- **Remove:** ambiguity caused by linking “Downloads” directly to a chapter listing.
- **Move:** export module to its own route and optionally cross-link from chapter pages.
- **Modify:** rename nav item to either `Exports` (if technical audience) or `Offline reading` (if broad audience).

### Why this matters
Clear labels reduce pogo-sticking and increase confidence in navigation.

---

## 3) First-run onboarding is implicit, not explicit

### Problem
The homepage offers “Start reading”, but there is no explicit “new here” micro-onboarding sequence or fast path.

### Add / Remove / Move / Modify
- **Add:** “New reader? Start in 3 minutes” module with 3 links:
  1. framing chapter,
  2. one mechanism,
  3. one toolkit action.
- **Remove:** duplicate explanatory copy where possible.
- **Move:** this module above the snapshot metrics.
- **Modify:** reduce intro paragraph length; prefer action-oriented copy.

### Why this matters
Task-based onboarding increases activation and completion for first sessions.

---

## 4) Mobile navigation affordances are functional but not elegant

### Problem
The `More` disclosure works, but the default header stack plus utility controls consumes too much vertical space and feels tool-heavy.

### Add / Remove / Move / Modify
- **Add:** compact sticky bottom CTA (`Read`, `Search`, `Menu`) on mobile.
- **Remove:** always-visible non-primary controls from top stack.
- **Move:** keyboard-shortcut help behind an overflow utility sheet (desktop and mobile).
- **Modify:** ensure primary nav text stays on one line at common mobile widths.

### Why this matters
Mobile users need quick content entry with minimal chrome.

---

## 5) Reader vs. author tools are mixed in the same discovery surface

### Problem
`Publishing and diagnostics` appears directly in the reading hub, which can dilute reader intent.

### Add / Remove / Move / Modify
- **Add:** role-aware segmentation (`Reader tools`, `Author tools`).
- **Remove:** author block from default reader page for non-author contexts.
- **Move:** diagnostics under a separate `/author` or settings context.
- **Modify:** if retained, collapse author tools by default and de-emphasize visually.

### Why this matters
Mode separation improves trust and focus.

---

## 6) State communication can be more actionable

### Problem
Draft/version/translation metadata is visible, but readers are not always told what to do with that state.

### Add / Remove / Move / Modify
- **Add:** concise action hints, e.g., “Prefer stable content? View latest stable release notes.”
- **Remove:** passive status-only phrasing where possible.
- **Move:** state hints adjacent to related actions.
- **Modify:** convert static status cards into CTA cards where feasible.

### Why this matters
Actionable system status improves comprehension and reduces hesitation.

---

## Prioritized roadmap

## Week 1 (quick wins)
1. Rename/retarget `Downloads` route semantics.
2. Add explicit `Start reading` CTA in global header.
3. Collapse or defer utility controls on mobile.

## Week 2–3 (structural)
1. Introduce dedicated `/downloads` page.
2. Split reader vs author tool surfaces.
3. Add “New reader? Start in 3 minutes” onboarding block.

## Week 4+ (optimization)
1. Instrument funnel analytics: home → read hub → first content item.
2. A/B test top CTA copy (`Start reading` vs `Begin with framing`).
3. Measure first-click success and time-to-first-content.

---

## Suggested success metrics

- **Primary:** Median time to first content click from homepage.
- **Primary:** First-session content-start rate (% of sessions that open chapter/mechanism/toolkit).
- **Secondary:** Mobile bounce rate from homepage.
- **Secondary:** Navigation reclick rate within first 30 seconds.

---

## Implementation notes for this codebase

- Most recommendations can be implemented in shared engine UI (`packages/astro-bookkit`) to preserve separation of concerns.
- Book-specific messaging can stay in `apps/bad-people` copy/config layers.
- Avoid embedding behavior-specific logic in content files.
