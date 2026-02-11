# UX Audit — `apps/bad-people` (Constructive + Kondo-style)

Date: 2026-02-11
Scope: Reader-facing IA and navigation surfaces (`/`, `/read`, shared layout controls).
Method: Static code review of layout/page structure and interaction patterns.

## Executive summary

The current UX has strong information density and meaningful affordances (search, keyboard shortcuts, reading paths), but it asks users to process too many choices too early. The highest-leverage improvements are to:

1. reduce duplicate entry points,
2. defer advanced controls until intent is clear,
3. group actions by reader job-to-be-done,
4. improve trust in labels (especially “updated” metadata).

This should make first-time orientation calmer without removing power-user capability.

---

## Kondo pass: what to **keep**, **remove**, **move**, and **modify**

## Keep (sparks value)

- **Reading hub as a central “switchboard.”** The route taxonomy (overview/chapters/mechanisms/toolkit/glossary/examples) is clear and supports non-linear reading.
- **Keyboard accelerators and skip link.** Accessibility and speed are already present.
- **Search + AI Q&A as optional overlays.** These are useful as opt-in support, especially for returning readers.

## Remove (or consolidate)

1. **Duplicate “release notes” pathways on the home page.**
   - There are two cards in the same section that both go to `/release-notes` (“Browse release notes” and “Track draft changes”).
   - Recommendation: keep one clear card; remove the duplicate variant.

2. **Always-on “updated” badges when provenance is not truly per-section.**
   - `updatedIn` is hard-coded on Toolkit and Examples using latest version, which can imply recency even when unchanged.
   - Recommendation: remove badge until section-level change detection exists, or relabel to avoid false precision.

## Move (to reduce cognitive load)

1. **Move “Author tools” farther from primary reading flow.**
   - Keep it in `/read`, but place behind an explicit “Publishing diagnostics” route or footer utility area.
   - Reason: mixed audience controls near core reader choices dilutes first-time focus.

2. **Move version/language controls into a compact utility menu by default on mobile and desktop.**
   - Current defaults open details blocks early, which competes with “start reading” intent.

## Modify (refine wording/interaction)

1. **Navigation hierarchy simplification**
   - Treat `/read` as the primary CTA, then progressively reveal secondary actions.
   - In header: preserve Search and Read; tuck Release Notes/Offline/Ask/Shortcuts under one “Tools” menu that is closed by default.

2. **Clarify “Show updated only” behavior**
   - If based on release metadata rather than true content diff, rename to “Show sections marked in latest release notes” or similar.

3. **Reduce section verbosity on first fold**
   - On `/read`, recommended paths + latest update + section grid + author tools creates too many blocks before any reading starts.
   - Keep one recommendation block and the main section grid; collapse update summary by default or move below the grid.

4. **Fix homepage first-action clarity**
   - Home currently has multiple “start” concepts (“Start in 3 minutes”, “Start reading”, snapshot cards).
   - Keep one primary intent strip and one secondary “book snapshot” section.

---

## Prioritized backlog (highest value first)

### P0 (do now)

- Remove duplicate home page release-notes card.
- Close advanced nav panels by default unless user explicitly opens them.
- Reword/remove potentially misleading “Updated in vX” labels.

### P1 (next)

- Refactor `/read` to emphasize one first action and one browse grid.
- Relocate author diagnostics into a separated utility area.

### P2 (later)

- Add true section-level change tracking to power accurate “updated” filters.
- Consider an explicit “Reader mode / Author mode” toggle persisted in local storage.

---

## Suggested acceptance checks

- First-time reader can choose a path within 5 seconds without opening any details panel.
- Header has no more than 2 primary actions visible at desktop first glance.
- No duplicate destination cards in the same section.
- “Updated” badges map to objective change metadata.

---

## Notes on risk and scope

These recommendations are primarily UI/content-architecture adjustments inside app and layout presentation layers. They do not require changing mechanism schemas, frame enforcement, or compiler invariants.
